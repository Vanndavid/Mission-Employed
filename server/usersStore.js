import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USERS_FILE = path.join(__dirname, 'data', 'users.json');

function usersFilePath() {
  return process.env.USERS_FILE || DEFAULT_USERS_FILE;
}

function ensureStore() {
  const file = usersFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ users: [] }, null, 2));
  }
  return file;
}

function readStore() {
  const file = ensureStore();
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users)) {
      return { users: [] };
    }
    return parsed;
  } catch {
    return { users: [] };
  }
}

function writeStore(store) {
  const file = ensureStore();
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

export function listUsers() {
  return readStore().users.map(publicUser);
}

export function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return readStore().users.find(u => u.email === normalized) || null;
}

export function findUserById(id) {
  return readStore().users.find(u => u.id === id) || null;
}

export function createUser({ email, passwordHash, salt, role = 'user', plan = 'free' }) {
  const store = readStore();
  const normalized = normalizeEmail(email);
  if (store.users.some(u => u.email === normalized)) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }
  const user = {
    id: randomUUID(),
    email: normalized,
    passwordHash,
    salt,
    role: role === 'admin' ? 'admin' : 'user',
    plan: plan === 'premium' ? 'premium' : 'free',
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  writeStore(store);
  return user;
}

export function updateUserPlan(userId, plan) {
  if (plan !== 'free' && plan !== 'premium') {
    const err = new Error('Plan must be free or premium');
    err.status = 400;
    throw err;
  }
  const store = readStore();
  const user = store.users.find(u => u.id === userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  user.plan = plan;
  writeStore(store);
  return user;
}

export function setUserRole(userId, role) {
  if (role !== 'user' && role !== 'admin') {
    const err = new Error('Role must be user or admin');
    err.status = 400;
    throw err;
  }
  const store = readStore();
  const user = store.users.find(u => u.id === userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  user.role = role;
  if (role === 'admin') user.plan = 'premium';
  writeStore(store);
  return user;
}

export function setUserPassword(userId, { salt, passwordHash }) {
  const store = readStore();
  const user = store.users.find(u => u.id === userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  user.salt = salt;
  user.passwordHash = passwordHash;
  writeStore(store);
  return user;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    plan: effectivePlan(user),
    createdAt: user.createdAt,
  };
}

export function effectivePlan(user) {
  if (!user) return 'free';
  if (user.role === 'admin') return 'premium';
  return user.plan === 'premium' ? 'premium' : 'free';
}

export function isPremium(user) {
  return effectivePlan(user) === 'premium';
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function resetStoreForTests() {
  const file = usersFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify({ users: [] }, null, 2));
}
