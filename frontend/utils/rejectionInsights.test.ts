import { describe, expect, it } from 'vitest';
import { JobApplication, JobStatus } from '../types';
import {
  categorizeReason,
  insightDate,
  rangeStart,
  rejectedOn,
  rejectionInsights,
} from './rejectionInsights';

function app(id: number, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    company: `Company ${id}`,
    role: 'Engineer',
    url: '',
    source: '',
    dateApplied: '2026-09-01',
    status: JobStatus.APPLIED,
    isImportant: false,
    notes: '',
    jobDescription: '',
    coverLetter: '',
    tailoredCV: '',
    interviewStages: [],
    nextAction: '',
    nextActionDue: '',
    recruiterContact: null,
    takeHome: null,
    offer: null,
    statusHistory: [],
    ...overrides,
  };
}

const rejected = (id: number, date: string, reasons: string[] = [], overrides: Partial<JobApplication> = {}) =>
  app(id, {
    status: JobStatus.REJECTED,
    statusHistory: [{ status: JobStatus.REJECTED, date: `${date}T09:00:00+00:00` }],
    rejectionReasons: reasons,
    ...overrides,
  });

const NOW = new Date(2026, 8, 25); // 25 Sep 2026, local

describe('categorizeReason', () => {
  it.each([
    ['Which of the following statements best describes your right to work in Australia?', 'Right to work'],
    ['Do you require visa sponsorship?', 'Right to work'],
    ['Are you an Australian citizen or permanent resident?', 'Right to work'],
    ["How many years' experience do you have as a full stack developer?", 'Experience'],
    ['How many years of AI Engineering experience do you have?', 'Experience'],
    ['Years of experience ("How many years..." question)', 'Experience'],
    ['Which of the following programming languages are you experienced in?', 'Experience'],
    ['Do you have a Bachelor degree in Computer Science?', 'Qualifications'],
    ["Do you hold a current driver's licence?", 'Qualifications'],
    ['What is your expected annual base salary?', 'Salary'],
    ["What's your notice period?", 'Availability'],
    ['How soon can you start?', 'Availability'],
    ['Are you willing to relocate?', 'Location'],
    ['Are you willing to work on-site 3 days a week?', 'Location'],
    ['Do you hold a current NV1 security clearance?', 'Clearances'],
    ['Are you willing to undergo a police check?', 'Clearances'],
    ['Something the rules have never seen', 'Other'],
  ])('%s → %s', (text, category) => {
    expect(categorizeReason(text)).toBe(category);
  });

  it('ignores case', () => {
    expect(categorizeReason('RIGHT TO WORK')).toBe('Right to work');
    expect(categorizeReason('YEARS OF EXPERIENCE')).toBe('Experience');
  });

  it('matches short keywords as whole words only', () => {
    // "pay" inside "payments", "live" inside "delivery".
    expect(categorizeReason('Have you worked with payments systems?')).toBe('Experience');
    expect(categorizeReason('Continuous delivery pipelines')).toBe('Other');
  });

  it('puts right to work first even when experience is also mentioned', () => {
    expect(categorizeReason('Years living in Australia with full work rights')).toBe('Right to work');
  });
});

describe('dates', () => {
  it('dates a rejection by its latest Rejected event', () => {
    const a = app(1, {
      status: JobStatus.REJECTED,
      statusHistory: [
        { status: JobStatus.APPLIED, date: '2026-08-01T00:00:00+00:00' },
        { status: JobStatus.REJECTED, date: '2026-08-20T00:00:00+00:00' },
      ],
    });
    expect(rejectedOn(a)).toBe('2026-08-20');
    expect(insightDate(a)).toBe('2026-08-20');
  });

  it('falls back to the applied date with no history', () => {
    expect(rejectedOn(app(1, { status: JobStatus.REJECTED, dateApplied: '2026-07-04' }))).toBe('2026-07-04');
  });

  it('dates an application that was not rejected by when it was applied for', () => {
    expect(insightDate(app(1, { dateApplied: '2026-06-10' }))).toBe('2026-06-10');
  });

  it('works out where each range starts', () => {
    expect(rangeStart('all', NOW)).toBeNull();
    expect(rangeStart('30d', NOW)).toBe('2026-08-26');
    expect(rangeStart('3m', NOW)).toBe('2026-06-25');
  });
});

describe('rejectionInsights', () => {
  const applications = [
    app(1, { dateApplied: '2026-09-20' }),
    rejected(2, '2026-09-10', [
      'Which of the following statements best describes your right to work in Australia?',
      "How many years' experience do you have as a full stack developer?",
    ]),
    rejected(3, '2026-09-05', ['How many years of AI Engineering experience do you have?', 'Years of experience']),
    rejected(4, '2026-07-15', ['Do you require visa sponsorship?']),
    rejected(5, '2026-07-02'),
  ];

  it('counts applications, rejections, and rejections with feedback', () => {
    const insights = rejectionInsights(applications, 'all', NOW);

    expect(insights.totalApplications).toBe(5);
    expect(insights.totalRejected).toBe(4);
    expect(insights.rejectedWithFeedback).toBe(3);
    expect(insights.rejectedWithFeedbackPercent).toBe(75);
  });

  it('counts applications per category, not reasons, most first', () => {
    const { categories } = rejectionInsights(applications, 'all', NOW);

    // App 3 has two experience reasons but counts once.
    expect(categories.map(c => [c.category, c.count, c.percent])).toEqual([
      ['Experience', 2, 67],
      ['Right to work', 2, 67],
    ]);
    expect(categories[0].matches).toHaveLength(3);
  });

  it('keeps the exact reason text and newest first in each category', () => {
    const rightToWork = rejectionInsights(applications, 'all', NOW).categories.find(
      c => c.category === 'Right to work',
    )!;

    expect(rightToWork.matches.map(m => [m.app.id, m.reason, m.date])).toEqual([
      [2, 'Which of the following statements best describes your right to work in Australia?', '2026-09-10'],
      [4, 'Do you require visa sponsorship?', '2026-07-15'],
    ]);
  });

  it('stacks rejections per month, with empty months filled in', () => {
    const { months } = rejectionInsights(applications, 'all', NOW);

    expect(months).toEqual([
      { month: '2026-07', withFeedback: 1, withoutFeedback: 1 },
      { month: '2026-08', withFeedback: 0, withoutFeedback: 0 },
      { month: '2026-09', withFeedback: 2, withoutFeedback: 0 },
    ]);
  });

  it('applies the date range to every figure', () => {
    const insights = rejectionInsights(applications, '30d', NOW);

    expect(insights.totalApplications).toBe(3);
    expect(insights.totalRejected).toBe(2);
    expect(insights.rejectedWithFeedback).toBe(2);
    expect(insights.categories.find(c => c.category === 'Right to work')!.count).toBe(1);
    expect(insights.months.map(m => m.month)).toEqual(['2026-08', '2026-09']);
  });

  it('leaves undated applications out of a limited range', () => {
    const undated = app(9, { dateApplied: '' });
    expect(rejectionInsights([undated], 'all', NOW).totalApplications).toBe(1);
    expect(rejectionInsights([undated], '30d', NOW).totalApplications).toBe(0);
  });

  it('ignores blank reasons', () => {
    const insights = rejectionInsights([rejected(1, '2026-09-01', ['  ', ''])], 'all', NOW);

    expect(insights.rejectedWithFeedback).toBe(0);
    expect(insights.categories).toEqual([]);
  });
});
