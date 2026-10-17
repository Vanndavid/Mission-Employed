import { describe, expect, it } from 'vitest';
import { describeSetting, describeUsage, extendPremiumUntil, hasLapsed, isUsedUp, usageFraction } from './planFormat';

describe('describeSetting', () => {
  it('says what a plan gives for a feature', () => {
    expect(describeSetting({ enabled: false, limit: 5, period: 'month' })).toBe('Not included');
    expect(describeSetting({ enabled: true, limit: null, period: 'day' })).toBe('Unlimited');
    expect(describeSetting({ enabled: true, limit: 20, period: 'day' })).toBe('20 per day');
    expect(describeSetting({ enabled: true, limit: 1500, period: 'month' })).toBe('1,500 per month');
  });
});

describe('describeUsage', () => {
  it('counts against the period the limit runs on', () => {
    expect(describeUsage({ enabled: true, limit: 20, period: 'day', used: 3 })).toBe('3 of 20 used today');
    expect(describeUsage({ enabled: true, limit: 3, period: 'week', used: 1 })).toBe('1 of 3 used this week');
    expect(describeUsage({ enabled: true, limit: 5, period: 'month', used: 5 })).toBe('5 of 5 used this month');
  });

  it('has nothing to count when unlimited or not included', () => {
    expect(describeUsage({ enabled: true, limit: null, period: 'day', used: 40 })).toBe('Unlimited');
    expect(describeUsage({ enabled: false, limit: 5, period: 'month', used: 0 })).toBe('Not on your plan');
  });
});

describe('usageFraction and isUsedUp', () => {
  it('fills the meter and caps it at full', () => {
    expect(usageFraction({ enabled: true, limit: 4, used: 1 })).toBe(0.25);
    expect(usageFraction({ enabled: true, limit: 4, used: 9 })).toBe(1);
    expect(usageFraction({ enabled: true, limit: null, used: 9 })).toBe(0);
    expect(isUsedUp({ enabled: true, limit: 4, used: 4 })).toBe(true);
    expect(isUsedUp({ enabled: true, limit: 4, used: 3 })).toBe(false);
    expect(isUsedUp({ enabled: true, limit: null, used: 400 })).toBe(false);
  });
});

describe('extendPremiumUntil', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  it('counts from now when there is no end date or it has passed', () => {
    expect(extendPremiumUntil(null, 1, now)).toBe('2026-11-17T12:00:00.000Z');
    expect(extendPremiumUntil('2026-10-01T00:00:00Z', 3, now)).toBe('2027-01-17T12:00:00.000Z');
  });

  it('runs on from an end date still ahead', () => {
    expect(extendPremiumUntil('2026-10-24T12:00:00Z', 1, now)).toBe('2026-11-24T12:00:00.000Z');
  });

  it('keeps to the last day of a shorter month', () => {
    expect(extendPremiumUntil(null, 1, new Date('2027-01-31T09:00:00Z'))).toBe('2027-02-28T09:00:00.000Z');
  });

  it('has no end date when no months are given', () => {
    expect(extendPremiumUntil('2026-10-24T12:00:00Z', null, now)).toBeNull();
  });
});

describe('hasLapsed', () => {
  it('is true from the end date on', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    expect(hasLapsed(null, now)).toBe(false);
    expect(hasLapsed('2026-10-17T12:00:01Z', now)).toBe(false);
    expect(hasLapsed('2026-10-17T12:00:00Z', now)).toBe(true);
  });
});
