/**
 * Talent score — keep in lockstep with utils/talentScore.ts
 */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function scale(value, cap, points) {
  if (cap <= 0) return 0;
  return (clamp(value, 0, cap) / cap) * points;
}

export function sampleGate(n, fullAt) {
  if (fullAt <= 0) return 1;
  return clamp(n / fullAt, 0, 1);
}

export function tierFromScore(total, placed) {
  if (placed) return 'placed';
  if (total >= 75) return 'elite';
  if (total >= 50) return 'specialist';
  if (total >= 25) return 'operator';
  return 'scout';
}

export function computeTalentScore(metrics) {
  const submitted = metrics.submitted || 0;
  const decided = (metrics.offers || 0) + (metrics.rejected || 0);

  const protocol = scale(metrics.protocolCompletionRate || 0, 100, 8);
  const streak = scale(metrics.streakDays || 0, 14, 5);
  const volume = scale(metrics.appsPerWeek || 0, 8, 4);
  const behavioral = metrics.behavioralThemesTotal > 0
    ? ((metrics.behavioralThemesReady || 0) / metrics.behavioralThemesTotal) * 2
    : 0;
  const docs = (metrics.profileReady ? 0.5 : 0) + (metrics.portfolioReady ? 0.5 : 0);
  const execution = protocol + streak + volume + behavioral + docs;

  const completed = scale(metrics.codingCompleted || 0, 30, 12);
  const medium = scale(metrics.codingMedium || 0, 12, 5);
  const hard = scale(metrics.codingHard || 0, 6, 5);
  const topics = scale((metrics.codingTopics || []).length, 6, 3);
  const technical = completed + medium + hard + topics;

  const a2i = scale(metrics.appliedToInterview || 0, 100, 14) * sampleGate(submitted, 6);
  const i2o = scale(metrics.interviewToOffer || 0, 100, 16) * sampleGate(decided, 3);
  const interview = a2i + i2o;

  const offers = scale(metrics.offers || 0, 2, 18);
  const live = scale(metrics.interviewing || 0, 3, 7);
  const outcome = offers + live;

  const total = clamp(Math.round(execution + technical + interview + outcome), 0, 100);
  const placed = (metrics.offers || 0) > 0;

  return {
    total,
    execution: Math.round(execution),
    technical: Math.round(technical),
    interview: Math.round(interview),
    outcome: Math.round(outcome),
    tier: tierFromScore(total, placed),
    placed,
  };
}

export function compareTalent(a, b) {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  if ((b.metrics.offers || 0) !== (a.metrics.offers || 0)) {
    return (b.metrics.offers || 0) - (a.metrics.offers || 0);
  }
  if ((b.metrics.appliedToInterview || 0) !== (a.metrics.appliedToInterview || 0)) {
    return (b.metrics.appliedToInterview || 0) - (a.metrics.appliedToInterview || 0);
  }
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

export function percentileForRank(rank, totalRanked) {
  if (totalRanked <= 0 || rank <= 0) return 0;
  return Math.round((1 - (rank - 1) / totalRanked) * 100);
}

const PERSONAS = new Set(['maintenance_swe', 'big_tech', 'startup', 'career_switcher']);

function num(v, min = 0, max = 1e6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

export function sanitizeMetrics(raw) {
  if (!raw || typeof raw !== 'object') {
    const err = new Error('Metrics are required');
    err.status = 400;
    throw err;
  }
  const topics = Array.isArray(raw.codingTopics)
    ? raw.codingTopics
      .filter(t => typeof t === 'string' && t.trim())
      .map(t => t.trim().slice(0, 40))
      .slice(0, 20)
    : [];

  return {
    huntPersona: PERSONAS.has(raw.huntPersona) ? raw.huntPersona : 'maintenance_swe',
    daysInSearch: num(raw.daysInSearch, 0, 3650),
    streakDays: num(raw.streakDays, 0, 3650),
    protocolCompletionRate: num(raw.protocolCompletionRate, 0, 100),
    appsPerWeek: num(raw.appsPerWeek, 0, 100),
    submitted: num(raw.submitted, 0, 10000),
    interviewing: num(raw.interviewing, 0, 1000),
    offers: num(raw.offers, 0, 100),
    rejected: num(raw.rejected, 0, 10000),
    appliedToInterview: num(raw.appliedToInterview, 0, 100),
    interviewToOffer: num(raw.interviewToOffer, 0, 100),
    codingCompleted: num(raw.codingCompleted, 0, 10000),
    codingEasy: num(raw.codingEasy, 0, 10000),
    codingMedium: num(raw.codingMedium, 0, 10000),
    codingHard: num(raw.codingHard, 0, 10000),
    codingTopics: topics,
    behavioralThemesReady: num(raw.behavioralThemesReady, 0, 50),
    behavioralThemesTotal: num(raw.behavioralThemesTotal, 0, 50),
    profileReady: Boolean(raw.profileReady),
    portfolioReady: Boolean(raw.portfolioReady),
  };
}
