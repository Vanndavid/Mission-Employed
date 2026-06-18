import { JobApplication, JobStatus } from '../types';

export interface FollowUpReminder {
  applicationId: string;
  company: string;
  role: string;
  daysSinceApplied: number;
  lastStatusDate: string;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function getLastStatusDate(app: JobApplication): string {
  const history = app.statusHistory ?? [];
  if (history.length > 0) return history[history.length - 1].date;
  return app.dateApplied;
}

export function computeFollowUpReminders(
  applications: JobApplication[],
  staleDays = 7
): FollowUpReminder[] {
  const now = new Date().toISOString();
  return applications
    .filter(app => app.status === JobStatus.APPLIED)
    .map(app => {
      const lastDate = getLastStatusDate(app);
      const days = daysBetween(lastDate, now);
      return {
        applicationId: app.id,
        company: app.company,
        role: app.role,
        daysSinceApplied: days,
        lastStatusDate: lastDate,
      };
    })
    .filter(r => r.daysSinceApplied >= staleDays)
    .sort((a, b) => b.daysSinceApplied - a.daysSinceApplied);
}
