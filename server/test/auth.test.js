import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpUsers = path.join(os.tmpdir(), `mission-employed-users-${process.pid}.json`);

process.env.NODE_ENV = 'test';
process.env.USERS_FILE = tmpUsers;
process.env.AUTH_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'adminpass123';

fs.writeFileSync(tmpUsers, JSON.stringify({ users: [] }, null, 2));

const { default: app } = await import('../index.js');
const request = (await import('supertest')).default;

describe('API health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});

describe('Auth and premium unlock', () => {
  let freeToken;
  let adminToken;
  let freeUserId;

  before(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass123' });
    assert.equal(login.status, 200);
    adminToken = login.body.token;
    assert.equal(login.body.user.role, 'admin');
    assert.equal(login.body.user.plan, 'premium');
  });

  it('registers a free account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.plan, 'free');
    assert.equal(res.body.user.role, 'user');
    freeToken = res.body.token;
    freeUserId = res.body.user.id;
  });

  it('blocks AI for free accounts', async () => {
    const res = await request(app)
      .post('/ai/coding/problem')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ difficulty: 'easy' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PREMIUM_REQUIRED');
  });

  it('admin can upgrade plan to premium', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${freeUserId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ plan: 'premium' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.plan, 'premium');
  });

  it('allows AI auth check after premium upgrade (fails only on missing Gemini, not 403)', async () => {
    const res = await request(app)
      .post('/ai/coding/problem')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ difficulty: 'easy' });
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 401);
  });

  it('lists users for admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.some(u => u.email === 'hunter@example.com'));
  });

  it('rejects admin routes for free users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${freeToken}`);
    assert.equal(res.status, 403);
  });
});
