import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findUserById, publicUser } from './usersStore.js';
import {
  compareTalent,
  computeTalentScore,
  percentileForRank,
  sanitizeMetrics,
} from './talentScore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TALENT_FILE = path.join(__dirname, 'data', 'talent.json');
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function talentFilePath() {
  return process.env.TALENT_FILE || DEFAULT_TALENT_FILE;
}

function ensureStore() {
  const file = talentFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ snapshots: {} }, null, 2));
  }
  return file;
}

function readStore() {
  const file = ensureStore();
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.snapshots !== 'object' || parsed.snapshots === null) {
      return { snapshots: {} };
    }
    return parsed;
  } catch {
    return { snapshots: {} };
  }
}

function writeStore(store) {
  const file = ensureStore();
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

export function upsertTalentSnapshot(userId, metrics) {
  const sanitized = sanitizeMetrics(metrics);
  const score = computeTalentScore(sanitized);
  const store = readStore();
  const existing = store.snapshots[userId] || {};
  store.snapshots[userId] = {
    metrics: sanitized,
    score,
    visibleToCompanies: Boolean(existing.visibleToCompanies),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.snapshots[userId];
}

export function setTalentVisibility(userId, visibleToCompanies) {
  if (typeof visibleToCompanies !== 'boolean') {
    const err = new Error('visibleToCompanies must be a boolean');
    err.status = 400;
    throw err;
  }
  const store = readStore();
  if (!store.snapshots[userId]) {
    const err = new Error('No talent snapshot yet. Hunt data syncs automatically after you use the dashboard.');
    err.status = 404;
    throw err;
  }
  store.snapshots[userId].visibleToCompanies = visibleToCompanies;
  writeStore(store);
  return store.snapshots[userId];
}

export function getTalentSnapshot(userId) {
  return readStore().snapshots[userId] || null;
}

function rankedRows() {
  const store = readStore();
  const rows = [];
  for (const [userId, snap] of Object.entries(store.snapshots)) {
    const user = findUserById(userId);
    if (!user) continue;
    rows.push({
      userId,
      user: publicUser(user),
      metrics: snap.metrics,
      score: snap.score,
      visibleToCompanies: Boolean(snap.visibleToCompanies),
      updatedAt: snap.updatedAt,
    });
  }
  rows.sort(compareTalent);
  const now = Date.now();
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    stale: now - Date.parse(row.updatedAt) > STALE_MS,
  }));
}

export function listAdminTalent() {
  return rankedRows().map(row => ({
    rank: row.rank,
    user: row.user,
    score: row.score,
    metrics: row.metrics,
    visibleToCompanies: row.visibleToCompanies,
    updatedAt: row.updatedAt,
    stale: row.stale,
  }));
}

export function getTalentMe(userId) {
  const ranked = rankedRows();
  const row = ranked.find(r => r.userId === userId) || null;
  const totalRanked = ranked.length;
  return {
    snapshot: row
      ? {
          metrics: row.metrics,
          score: row.score,
          visibleToCompanies: row.visibleToCompanies,
          updatedAt: row.updatedAt,
        }
      : null,
    rank: row ? row.rank : null,
    totalRanked,
    percentile: row ? percentileForRank(row.rank, totalRanked) : null,
  };
}

export function publicSnapshot(snap) {
  if (!snap) return null;
  return {
    metrics: snap.metrics,
    score: snap.score,
    visibleToCompanies: Boolean(snap.visibleToCompanies),
    updatedAt: snap.updatedAt,
  };
}

export function resetTalentStoreForTests() {
  const file = talentFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify({ snapshots: {} }, null, 2));
}
