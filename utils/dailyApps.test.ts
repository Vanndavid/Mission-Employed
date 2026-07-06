
import { describe, it, expect } from 'vitest';
import { countAppsToday } from './dailyApps';
import { JobStatus } from '../types';

describe('countAppsToday', () => {
  it('counts non-saved applications applied today', () => {
    const today = '2026-06-18';
    const apps = [
      { dateApplied: '2026-06-18T10:00:00.000Z', status: JobStatus.APPLIED },
      { dateApplied: '2026-06-17T10:00:00.000Z', status: JobStatus.APPLIED },
      { dateApplied: '2026-06-18T12:00:00.000Z', status: JobStatus.SAVED },
    ] as any[];
    expect(countAppsToday(apps, today)).toBe(1);
  });
});
