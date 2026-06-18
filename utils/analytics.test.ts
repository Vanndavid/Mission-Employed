
import { describe, it, expect } from 'vitest';
import { computeFunnel, computeConversions, computeProtocolCompletionRate } from './analytics';
import { JobStatus } from '../types';
import { DAILY_TASKS } from '../constants';

describe('analytics', () => {
  it('computes funnel counts', () => {
    const funnel = computeFunnel([
      { status: JobStatus.SAVED } as any,
      { status: JobStatus.APPLIED } as any,
      { status: JobStatus.INTERVIEWING } as any,
      { status: JobStatus.OFFER } as any,
      { status: JobStatus.REJECTED } as any,
    ]);
    expect(funnel.saved).toBe(1);
    expect(funnel.applied).toBe(1);
    expect(funnel.interviewing).toBe(1);
    expect(funnel.offer).toBe(1);
    expect(funnel.rejected).toBe(1);
    expect(funnel.total).toBe(5);
  });

  it('computes conversion rates', () => {
    const funnel = { saved: 0, applied: 2, interviewing: 3, offer: 1, rejected: 2, total: 8 };
    const rates = computeConversions(funnel);
    expect(rates.appliedToInterview).toBe(75);
    expect(rates.overallOfferRate).toBe(13);
  });

  it('computes protocol completion rate', () => {
    const today = new Date();
    const d1 = new Date(today);
    const d2 = new Date(today);
    d2.setDate(d2.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const logs = {
      [fmt(d1)]: { date: fmt(d1), completions: Object.fromEntries(DAILY_TASKS.map(t => [t.id, true])) },
      [fmt(d2)]: { date: fmt(d2), completions: { codingEasy: true } },
    };
    const rate = computeProtocolCompletionRate(logs, DAILY_TASKS, 2);
    expect(rate).toBe(50);
  });
});
