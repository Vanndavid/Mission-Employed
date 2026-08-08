import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
import {
  createUser,
  findUserByEmail,
  findUserById,
  publicUser,
  isPremium,
  normalizeEmail,
  setUserRole,
} from './usersStore.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SCRYPT_KEYLEN = 64;

function authSecret() {
  return process.env.AUTH_SECRET || 'dev-auth-secret-change-me';
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, passwordHash: hash };
}

export function verifyPassword(password, salt, passwordHash) {
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(passwordHash, 'hex');
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function issueToken(userId) {
  const payload = {
    sub: userId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', authSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', authSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body));
    if (!payload.sub || !payload.exp || Date.now() > payload.exp) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function registerUser({ email, password }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    const err = new Error('Valid email is required');
    err.status = 400;
    throw err;
  }
  if (!password || String(password).length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const { salt, passwordHash } = hashPassword(password);
  const user = createUser({ email: normalized, passwordHash, salt, role: 'user', plan: 'free' });
  const token = issueToken(user.id);
  return { user: publicUser(user), token };
}

export function loginUser({ email, password }) {
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  return { user: publicUser(user), token: issueToken(user.id) };
}

export function getUserFromAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  const userId = verifyToken(token);
  if (!userId) return null;
  return findUserById(userId);
}

export function requireAuth(req, res, next) {
  const user = getUserFromAuthHeader(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requirePremium(req, res, next) {
  if (!req.user || !isPremium(req.user)) {
    return res.status(403).json({
      error: 'Premium required',
      code: 'PREMIUM_REQUIRED',
      message: 'This feature is unlocked on Premium. Ask an admin to upgrade your account.',
    });
  }
  next();
}

export function optionalAuth(req, _res, next) {
  req.user = getUserFromAuthHeader(req.headers.authorization);
  next();
}

export function ensureBootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;
  const existing = findUserByEmail(email);
  if (existing) {
    if (existing.role !== 'admin') {
      return publicUser(setUserRole(existing.id, 'admin'));
    }
    return publicUser(existing);
  }
  const { salt, passwordHash } = hashPassword(password);
  const user = createUser({
    email,
    passwordHash,
    salt,
    role: 'admin',
    plan: 'premium',
  });
  return publicUser(user);
}
