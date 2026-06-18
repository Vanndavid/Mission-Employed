
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index.js';

describe('API health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});
