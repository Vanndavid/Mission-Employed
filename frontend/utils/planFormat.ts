/**
 * Wording and date arithmetic for plans, allowances and subscriptions. Pure,
 * so the plans page and the admin screens share one way of saying things.
 */

import { FeatureAllowance, FeatureSetting, QuotaPeriod } from '../types/auth';

const PERIOD_NOUN: Record<QuotaPeriod, string> = { day: 'day', week: 'week', month: 'month' };
const PERIOD_NOW: Record<QuotaPeriod, string> = { day: 'today', week: 'this week', month: 'this month' };

/** "Not included", "Unlimited" or "20 per day". */
export function describeSetting(setting: Pick<FeatureSetting, 'enabled' | 'limit' | 'period'>): string {
  if (!setting.enabled) return 'Not included';
  if (setting.limit === null) return 'Unlimited';
  return `${setting.limit.toLocaleString('en')} per ${PERIOD_NOUN[setting.period]}`;
}

/** "3 of 20 used today", or "Unlimited" when there is nothing to count against. */
export function describeUsage(allowance: Pick<FeatureAllowance, 'enabled' | 'limit' | 'period' | 'used'>): string {
  if (!allowance.enabled) return 'Not on your plan';
  if (allowance.limit === null) return 'Unlimited';
  return `${allowance.used.toLocaleString('en')} of ${allowance.limit.toLocaleString('en')} used ${PERIOD_NOW[allowance.period]}`;
}

/** 0–1 for a usage meter; 0 when unlimited or not included. */
export function usageFraction(allowance: Pick<FeatureAllowance, 'enabled' | 'limit' | 'used'>): number {
  if (!allowance.enabled || allowance.limit === null || allowance.limit <= 0) return 0;
  return Math.min(1, allowance.used / allowance.limit);
}

export function isUsedUp(allowance: Pick<FeatureAllowance, 'enabled' | 'limit' | 'used'>): boolean {
  return allowance.enabled && allowance.limit !== null && allowance.used >= allowance.limit;
}

/**
 * When a Premium plan granted for `months` more should end. It runs on from
 * the current end date when that is still ahead, so granting a month to
 * someone with a week left gives them five weeks, not four. Null months: no
 * end date.
 */
export function extendPremiumUntil(currentEnd: string | null, months: number | null, now: Date = new Date()): string | null {
  if (months === null) return null;

  const current = currentEnd ? new Date(currentEnd) : null;
  const from = current && current.getTime() > now.getTime() ? current : now;
  const end = new Date(from.getTime());
  const day = end.getUTCDate();

  end.setUTCMonth(end.getUTCMonth() + months);
  // 31 January + 1 month is 28 February, not 3 March.
  if (end.getUTCDate() !== day) end.setUTCDate(0);

  return end.toISOString();
}

/** True when an end date has passed. */
export function hasLapsed(end: string | null, now: Date = new Date()): boolean {
  return end !== null && new Date(end).getTime() <= now.getTime();
}

/** "18 Nov 2026", in the viewer's locale. */
export function formatPlanDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
