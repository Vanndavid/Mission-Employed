import { describe, it, expect } from 'vitest';
import { computeTalentScore, compareTalent, percentileForRank, sampleGate, tierFromScore } from './talentScore';
import { TalentMetrics } from '../types/talent';
import { buildTalentMetrics } from './talentMetrics';
import { createDefaultState } from './migrateState';
import { DAILY_TASKS } from '../constants';
import { JobStatus } from '../types';

function metrics(partial: Partial<TalentMetrics> = {}): TalentMetrics {
  return {
    huntPersona: 'maintenance_swe',
    daysInSearch: 0,
    streakDays: 0,
    protocolCompletionRate: 0,
    appsPerWeek: 0,
    submitted: 0,
    interviewing: 0,
    offers: 0,
    rejected: 0,
    appliedToInterview: 0,
    interviewToOffer: 0,
    codingCompleted: 0,
    codingEasy: 0,
    codingMedium: 0,
    codingHard: 0,
    codingTopics: [],
    behavioralThemesReady: 0,
    behavioralThemesTotal: 6,
    profileReady: false,
    portfolioReady: false,
    ...partial,
  };
}

describe('talent score', () => {
  it('scores an empty hunter as Scout at 0', () => {
    const score = computeTalentScore(metrics());
    expect(score.total).toBe(0);
    expect(score.tier).toBe('scout');
    expect(score.placed).toBe(false);
  });

  it('marks hunters with an offer as Placed', () => {
    const score = computeTalentScore(metrics({
      offers: 1,
      submitted: 8,
      rejected: 2,
      appliedToInterview: 50,
      interviewToOffer: 33,
    }));
    expect(score.placed).toBe(true);
    expect(score.tier).toBe('placed');
    expect(score.outcome).toBeGreaterThan(0);
  });

  it('gates interview conversion until there is sample size', () => {
    const premature = computeTalentScore(metrics({
      submitted: 1,
      appliedToInterview: 100,
      interviewToOffer: 100,
    }));
    const proven = computeTalentScore(metrics({
      submitted: 6,
      rejected: 3,
      appliedToInterview: 100,
      interviewToOffer: 100,
    }));
    expect(premature.interview).toBeLessThan(proven.interview);
    expect(proven.interview).toBeGreaterThanOrEqual(28);
  });

  it('rewards coding mix and topic breadth', () => {
    const light = computeTalentScore(metrics({ codingCompleted: 4, codingEasy: 4 }));
    const deep = computeTalentScore(metrics({
      codingCompleted: 30,
      codingEasy: 12,
      codingMedium: 12,
      codingHard: 6,
      codingTopics: ['Arrays', 'Trees', 'Graphs', 'SQL', 'DP', 'Strings'],
    }));
    expect(deep.technical).toBeGreaterThan(light.technical);
    expect(deep.technical).toBe(25);
  });

  it('caps execution at 20 with full protocol and docs', () => {
    const score = computeTalentScore(metrics({
      protocolCompletionRate: 100,
      streakDays: 14,
      appsPerWeek: 8,
      behavioralThemesReady: 6,
      behavioralThemesTotal: 6,
      profileReady: true,
      portfolioReady: true,
    }));
    expect(score.execution).toBe(20);
  });

  it('ranks higher scores first, then offers', () => {
    const a = { score: computeTalentScore(metrics({ offers: 2 })), metrics: metrics({ offers: 2 }), updatedAt: '2026-01-01' };
    const b = { score: computeTalentScore(metrics({ offers: 1 })), metrics: metrics({ offers: 1 }), updatedAt: '2026-02-01' };
    expect(compareTalent(a, b)).toBeLessThan(0);
  });

  it('computes percentile with rank 1 as 100', () => {
    expect(percentileForRank(1, 10)).toBe(100);
    expect(percentileForRank(10, 10)).toBe(10);
    expect(percentileForRank(1, 1)).toBe(100);
  });

  it('maps score bands to tiers', () => {
    expect(tierFromScore(10, false)).toBe('scout');
    expect(tierFromScore(25, false)).toBe('operator');
    expect(tierFromScore(50, false)).toBe('specialist');
    expect(tierFromScore(75, false)).toBe('elite');
    expect(tierFromScore(10, true)).toBe('placed');
  });

  it('sampleGate is 0 at n=0 and 1 at fullAt', () => {
    expect(sampleGate(0, 6)).toBe(0);
    expect(sampleGate(3, 6)).toBe(0.5);
    expect(sampleGate(6, 6)).toBe(1);
  });
});

describe('server score stays in lockstep', () => {
  it('matches utils/talentScore.ts for the same metrics', async () => {
    const { computeTalentScore: computeJs } = await import('../server/talentScore.js');
    const input = metrics({
      protocolCompletionRate: 80,
      streakDays: 7,
      appsPerWeek: 4,
      submitted: 12,
      interviewing: 2,
      offers: 1,
      rejected: 3,
      appliedToInterview: 50,
      interviewToOffer: 25,
      codingCompleted: 18,
      codingMedium: 8,
      codingHard: 3,
      codingTopics: ['SQL', 'Trees'],
      behavioralThemesReady: 4,
      behavioralThemesTotal: 6,
      profileReady: true,
    });
    expect(computeJs(input)).toEqual(computeTalentScore(input));
  });
});

describe('buildTalentMetrics', () => {
  it('builds zeros from default state', () => {
    const state = createDefaultState();
    const m = buildTalentMetrics(state, DAILY_TASKS, 0);
    expect(m.submitted).toBe(0);
    expect(m.codingCompleted).toBe(0);
    expect(m.behavioralThemesReady).toBe(0);
    expect(m.profileReady).toBe(false);
    expect(m.huntPersona).toBe('maintenance_swe');
  });

  it('counts funnel, coding, and ready STAR themes', () => {
    const state = createDefaultState();
    state.applications = [
      { status: JobStatus.APPLIED, dateApplied: '2026-01-01' } as any,
      { status: JobStatus.INTERVIEWING, dateApplied: '2026-01-02' } as any,
      { status: JobStatus.OFFER, dateApplied: '2026-01-03' } as any,
      { status: JobStatus.SAVED, dateApplied: '2026-01-04' } as any,
    ];
    state.codingHistory = [
      { date: '2026-01-01', difficulty: 'medium', title: 'Two Sum', completed: true, topics: ['Arrays'] },
      { date: '2026-01-02', difficulty: 'hard', title: 'Skip', completed: false, topics: ['Graphs'] },
    ];
    state.behavioralAnswers = [
      { themeId: 'failure', bullets: ['Shipped a rollback'] },
      { themeId: 'impact', bullets: [''] },
    ];
    state.baseCV = 'Senior SWE';
    state.portfolioUrl = 'https://example.com';

    const m = buildTalentMetrics(state, DAILY_TASKS, 3);
    expect(m.submitted).toBe(3);
    expect(m.interviewing).toBe(1);
    expect(m.offers).toBe(1);
    expect(m.codingCompleted).toBe(1);
    expect(m.codingMedium).toBe(1);
    expect(m.codingTopics).toEqual(['Arrays', 'Graphs']);
    expect(m.behavioralThemesReady).toBe(1);
    expect(m.profileReady).toBe(true);
    expect(m.portfolioReady).toBe(true);
    expect(m.streakDays).toBe(3);
  });
});
