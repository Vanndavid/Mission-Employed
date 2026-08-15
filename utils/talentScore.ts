import { TalentMetrics, TalentScore, TalentTier } from '../types/talent';

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scale(value: number, cap: number, points: number): number {
  if (cap <= 0) return 0;
  return (clamp(value, 0, cap) / cap) * points;
}

/** 0 until there is sample size; 1 once `fullAt` observations exist. */
export function sampleGate(n: number, fullAt: number): number {
  if (fullAt <= 0) return 1;
  return clamp(n / fullAt, 0, 1);
}

export function tierFromScore(total: number, placed: boolean): TalentTier {
  if (placed) return 'placed';
  if (total >= 75) return 'elite';
  if (total >= 50) return 'specialist';
  if (total >= 25) return 'operator';
  return 'scout';
}

/**
 * 0–100 talent score for ranking hunters (and later, placing them with companies).
 *
 * Pillars (100 pts):
 * - Execution 20 — protocol, streak, volume, STAR bank, docs
 * - Technical 25 — completed problems, medium/hard mix, topic breadth
 * - Interview 30 — conversion rates, gated by sample size
 * - Outcome 25 — offers and live interviews
 */
export function computeTalentScore(metrics: TalentMetrics): TalentScore {
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

export function compareTalent(
  a: { score: TalentScore; metrics: TalentMetrics; updatedAt: string },
  b: { score: TalentScore; metrics: TalentMetrics; updatedAt: string }
): number {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  if ((b.metrics.offers || 0) !== (a.metrics.offers || 0)) {
    return (b.metrics.offers || 0) - (a.metrics.offers || 0);
  }
  if ((b.metrics.appliedToInterview || 0) !== (a.metrics.appliedToInterview || 0)) {
    return (b.metrics.appliedToInterview || 0) - (a.metrics.appliedToInterview || 0);
  }
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

export function percentileForRank(rank: number, totalRanked: number): number {
  if (totalRanked <= 0 || rank <= 0) return 0;
  return Math.round((1 - (rank - 1) / totalRanked) * 100);
}
