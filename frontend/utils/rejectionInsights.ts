/**
 * Rejection feedback: sorting Seek's screening-question reasons into a few
 * categories, and the numbers the Insights tab charts from them.
 *
 * Pure functions only, so every rule here is testable without a DOM and the
 * Insights tab renders whatever {@link rejectionInsights} returns.
 */

import { JobApplication, JobStatus } from '../types';
import { statusUpdatedAt } from './applicationTable';

export type ReasonCategory =
  | 'Right to work'
  | 'Clearances'
  | 'Salary'
  | 'Availability'
  | 'Location'
  | 'Qualifications'
  | 'Experience'
  | 'Other';

/**
 * Checked in order, first match wins. Order matters where a question could
 * fit two: "Do you hold a degree and 3 years' experience?" is really about the
 * degree, so qualifications come before experience, and right to work comes
 * first of all because it is a hard gate however the question is phrased.
 *
 * Word boundaries keep short keywords honest — "pay" must not match
 * "payments", "live" must not match "delivery".
 */
const RULES: { category: ReasonCategory; pattern: RegExp }[] = [
  {
    category: 'Right to work',
    pattern: /right to work|work rights|\bvisa|citizen|permanent resident|\bresidency\b|sponsor/i,
  },
  {
    category: 'Clearances',
    pattern: /clearance|police check|background check|criminal|working with children|\bnv1\b|\bbaseline\b/i,
  },
  {
    category: 'Salary',
    pattern: /salary|remuneration|\bpay\b|compensation|\brate\b|expected (?:base|package)/i,
  },
  {
    category: 'Availability',
    pattern: /notice period|\bnotice\b|\bavailab|\bstart\b|full[- ]time|part[- ]time|\bshifts?\b|on[- ]call|weekends?/i,
  },
  {
    category: 'Location',
    pattern: /relocat|commut|\blocated\b|\blive\b|\bbased in\b|on[- ]?site|in the office|\boffice\b|hybrid|travel/i,
  },
  {
    category: 'Qualifications',
    pattern: /degree|qualification|certif|bachelor|master'?s|diploma|licen[cs]e|tertiary/i,
  },
  {
    category: 'Experience',
    pattern: /experience|\byears?\b|worked (?:in|with|as)|familiar|proficien|skills?\b|knowledge of/i,
  },
];

/** Which category a single reason falls in. Anything unrecognised is 'Other'. */
export function categorizeReason(text: string): ReasonCategory {
  return RULES.find(rule => rule.pattern.test(text))?.category ?? 'Other';
}

/** Reasons as the tracker holds them: trimmed, with blanks dropped. */
export function rejectionReasonsOf(app: JobApplication): string[] {
  return (app.rejectionReasons ?? []).map(reason => reason.trim()).filter(Boolean);
}

export type InsightsRange = 'all' | '3m' | '30d';

export const INSIGHTS_RANGES: { key: InsightsRange; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '3m', label: 'Last 3 months' },
  { key: '30d', label: 'Last 30 days' },
];

/** 'YYYY-MM-DD' in local time — never shifted a day by UTC. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first day inside the range, or null for all time. */
export function rangeStart(range: InsightsRange, now: Date): string | null {
  if (range === 'all') return null;

  const start = new Date(now);
  if (range === '30d') start.setDate(start.getDate() - 30);
  else start.setMonth(start.getMonth() - 3);

  return localDay(start);
}

/**
 * When the application was rejected, as 'YYYY-MM-DD': the latest Rejected
 * event, else the latest status change, else the day it was applied for.
 * '' when there is nothing to date it by.
 */
export function rejectedOn(app: JobApplication): string {
  const rejections = (app.statusHistory ?? [])
    .filter(entry => entry.status === JobStatus.REJECTED && entry.date)
    .map(entry => entry.date.slice(0, 10))
    .sort();

  return rejections.at(-1) ?? (statusUpdatedAt(app) || app.dateApplied || '');
}

/**
 * The date an application counts under for the range filter: when it was
 * rejected if it was, otherwise when it was applied for. So "last 30 days"
 * means "rejected in the last 30 days" for the rejection figures, and
 * "applied in the last 30 days" for the rest.
 */
export function insightDate(app: JobApplication): string {
  if (app.status === JobStatus.REJECTED) return rejectedOn(app);
  return app.dateApplied || statusUpdatedAt(app);
}

/** One reason, and the application it came from. */
export interface ReasonMatch {
  app: JobApplication;
  reason: string;
  date: string;
}

export interface CategoryBar {
  category: ReasonCategory;
  /** Applications with at least one reason in this category — not reasons. */
  count: number;
  /** count as a share of the applications that have feedback, 0–100. */
  percent: number;
  matches: ReasonMatch[];
}

export interface MonthBar {
  /** 'YYYY-MM' */
  month: string;
  withFeedback: number;
  withoutFeedback: number;
}

export interface RejectionInsights {
  totalApplications: number;
  totalRejected: number;
  /** Applications in range that have any feedback, whatever their status. */
  withFeedback: number;
  /** Rejected applications that have feedback. */
  rejectedWithFeedback: number;
  /** rejectedWithFeedback as a share of totalRejected, 0–100. */
  rejectedWithFeedbackPercent: number;
  categories: CategoryBar[];
  months: MonthBar[];
}

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Every 'YYYY-MM' from first to last inclusive, so empty months still show. */
function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  let [year, month] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);

  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

export function rejectionInsights(
  applications: JobApplication[],
  range: InsightsRange,
  now: Date = new Date(),
): RejectionInsights {
  const start = rangeStart(range, now);
  // An undated application only has a place in "all time".
  const inRange = applications.filter(app => {
    if (!start) return true;
    const date = insightDate(app);
    return date !== '' && date >= start;
  });

  const rejected = inRange.filter(app => app.status === JobStatus.REJECTED);
  const withFeedback = inRange.filter(app => rejectionReasonsOf(app).length > 0);
  const rejectedWithFeedback = rejected.filter(app => rejectionReasonsOf(app).length > 0);

  const byCategory = new Map<ReasonCategory, { apps: Set<number>; matches: ReasonMatch[] }>();
  for (const app of withFeedback) {
    const date = insightDate(app);
    for (const reason of rejectionReasonsOf(app)) {
      const category = categorizeReason(reason);
      const entry = byCategory.get(category) ?? { apps: new Set<number>(), matches: [] };
      entry.apps.add(app.id);
      entry.matches.push({ app, reason, date });
      byCategory.set(category, entry);
    }
  }

  const categories: CategoryBar[] = [...byCategory.entries()]
    .map(([category, { apps, matches }]) => ({
      category,
      count: apps.size,
      percent: percentOf(apps.size, withFeedback.length),
      matches: [...matches].sort((a, b) => b.date.localeCompare(a.date)),
    }))
    // Most first; 'Other' last among equals so a named category leads a tie.
    .sort(
      (a, b) =>
        b.count - a.count ||
        Number(a.category === 'Other') - Number(b.category === 'Other') ||
        a.category.localeCompare(b.category),
    );

  const counts = new Map<string, MonthBar>();
  for (const app of rejected) {
    const date = rejectedOn(app);
    if (!date) continue;
    const month = date.slice(0, 7);
    const bar = counts.get(month) ?? { month, withFeedback: 0, withoutFeedback: 0 };
    if (rejectionReasonsOf(app).length > 0) bar.withFeedback += 1;
    else bar.withoutFeedback += 1;
    counts.set(month, bar);
  }

  const sortedMonths = [...counts.keys()].sort();
  const months =
    sortedMonths.length === 0
      ? []
      : monthsBetween(
          start ? start.slice(0, 7) : sortedMonths[0],
          localDay(now).slice(0, 7) > sortedMonths.at(-1)! ? localDay(now).slice(0, 7) : sortedMonths.at(-1)!,
        ).map(month => counts.get(month) ?? { month, withFeedback: 0, withoutFeedback: 0 });

  return {
    totalApplications: inRange.length,
    totalRejected: rejected.length,
    withFeedback: withFeedback.length,
    rejectedWithFeedback: rejectedWithFeedback.length,
    rejectedWithFeedbackPercent: percentOf(rejectedWithFeedback.length, rejected.length),
    categories,
    months,
  };
}

/** "Sep 2026" from '2026-09'. */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
