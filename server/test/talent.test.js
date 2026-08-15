import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpUsers = path.join(os.tmpdir(), `mission-employed-talent-users-${process.pid}.json`);
const tmpTalent = path.join(os.tmpdir(), `mission-employed-talent-${process.pid}.json`);

process.env.NODE_ENV = 'test';
process.env.USERS_FILE = tmpUsers;
process.env.TALENT_FILE = tmpTalent;
process.env.AUTH_SECRET = 'test-secret-talent';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'adminpass123';

fs.writeFileSync(tmpUsers, JSON.stringify({ users: [] }, null, 2));
fs.writeFileSync(tmpTalent, JSON.stringify({ snapshots: {} }, null, 2));

const { default: app } = await import('../index.js');
const request = (await import('supertest')).default;

const strongMetrics = {
  huntPersona: 'big_tech',
  daysInSearch: 40,
  streakDays: 12,
  protocolCompletionRate: 80,
  appsPerWeek: 6,
  submitted: 20,
  interviewing: 3,
  offers: 1,
  rejected: 4,
  appliedToInterview: 40,
  interviewToOffer: 20,
  codingCompleted: 25,
  codingEasy: 10,
  codingMedium: 10,
  codingHard: 5,
  codingTopics: ['Arrays', 'Trees', 'SQL'],
  behavioralThemesReady: 5,
  behavioralThemesTotal: 6,
  profileReady: true,
  portfolioReady: true,
};

describe('Talent ranking', () => {
  let adminToken;
  let hunterToken;
  let quietToken;

  before(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass123' });
    assert.equal(login.status, 200);
    adminToken = login.body.token;

    const hunter = await request(app)
      .post('/api/auth/register')
      .send({ email: 'ace@example.com', password: 'password123' });
    assert.equal(hunter.status, 201);
    hunterToken = hunter.body.token;

    const quiet = await request(app)
      .post('/api/auth/register')
      .send({ email: 'quiet@example.com', password: 'password123' });
    assert.equal(quiet.status, 201);
    quietToken = quiet.body.token;
  });

  it('rejects unauthenticated snapshot uploads', async () => {
    const res = await request(app).put('/api/talent/snapshot').send({ metrics: strongMetrics });
    assert.equal(res.status, 401);
  });

  it('stores a snapshot, scores it server-side, and returns rank', async () => {
    const res = await request(app)
      .put('/api/talent/snapshot')
      .set('Authorization', `Bearer ${hunterToken}`)
      .send({ metrics: strongMetrics });
    assert.equal(res.status, 200);
    assert.equal(res.body.rank, 1);
    assert.equal(res.body.totalRanked, 1);
    assert.equal(res.body.percentile, 100);
    assert.equal(res.body.snapshot.score.placed, true);
    assert.equal(res.body.snapshot.score.tier, 'placed');
    assert.equal(res.body.snapshot.visibleToCompanies, false);
    assert.ok(res.body.snapshot.score.total > 40);
  });

  it('ranks a quieter hunter below a stronger one', async () => {
    const res = await request(app)
      .put('/api/talent/snapshot')
      .set('Authorization', `Bearer ${quietToken}`)
      .send({
        metrics: {
          huntPersona: 'startup',
          submitted: 2,
          protocolCompletionRate: 10,
          codingCompleted: 1,
          behavioralThemesTotal: 6,
        },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.rank, 2);
    assert.equal(res.body.totalRanked, 2);
    assert.ok(res.body.snapshot.score.total < 40);
  });

  it('lets a hunter opt into company listing', async () => {
    const res = await request(app)
      .patch('/api/talent/visibility')
      .set('Authorization', `Bearer ${hunterToken}`)
      .send({ visibleToCompanies: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.snapshot.visibleToCompanies, true);
  });

  it('returns the hunter view of rank', async () => {
    const res = await request(app)
      .get('/api/talent/me')
      .set('Authorization', `Bearer ${hunterToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rank, 1);
    assert.equal(res.body.snapshot.visibleToCompanies, true);
  });

  it('lists the ranked roster for admins', async () => {
    const res = await request(app)
      .get('/api/admin/talent')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.talents.length, 2);
    assert.equal(res.body.talents[0].user.email, 'ace@example.com');
    assert.equal(res.body.talents[0].rank, 1);
    assert.equal(res.body.talents[0].visibleToCompanies, true);
    assert.equal(res.body.talents[1].user.email, 'quiet@example.com');
  });

  it('rejects the talent roster for non-admins', async () => {
    const res = await request(app)
      .get('/api/admin/talent')
      .set('Authorization', `Bearer ${hunterToken}`);
    assert.equal(res.status, 403);
  });

  it('ignores client-supplied scores', async () => {
    const res = await request(app)
      .put('/api/talent/snapshot')
      .set('Authorization', `Bearer ${quietToken}`)
      .send({
        metrics: { submitted: 0 },
        score: { total: 99, tier: 'elite' },
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.snapshot.score.total < 20);
    assert.equal(res.body.snapshot.score.tier, 'scout');
  });
});
