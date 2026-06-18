
import { AppState, DailyLog, JobApplication, JobStatus, TaskDefinition } from '../types';
import { getLocalDateString } from '../utils';

export interface FunnelCounts {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
  total: number;
}

export interface ConversionRates {
  appliedToInterview: number;
  interviewToOffer: number;
  overallOfferRate: number;
}

export interface AnalyticsSnapshot {
  appsPerWeek: { week: string; count: number }[];
  funnel: FunnelCounts;
  conversions: ConversionRates;
  medianDaysInStage: Record<string, number>;
  criteriaVsOutcome: { score: number; status: JobStatus; company: string }[];
  protocolCompletionRate: number;
  streakDays: number;
  daysInSearch: number;
  projectedPace: { appsPerWeek: number; weeksToTarget: number | null };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return getLocalDateString(start);
}

export function computeAppsPerWeek(applications: JobApplication[]): { week: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const app of applications) {
    if (app.status === JobStatus.SAVED) continue;
    const week = getWeekKey(app.dateApplied);
    counts[week] = (counts[week] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, count]) => ({ week, count }));
}

export function computeFunnel(applications: JobApplication[]): FunnelCounts {
  const funnel: FunnelCounts = {
    saved: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    total: applications.length,
  };
  for (const app of applications) {
    switch (app.status) {
      case JobStatus.SAVED: funnel.saved++; break;
      case JobStatus.APPLIED: funnel.applied++; break;
      case JobStatus.INTERVIEWING: funnel.interviewing++; break;
      case JobStatus.OFFER: funnel.offer++; break;
      case JobStatus.REJECTED: funnel.rejected++; break;
    }
  }
  return funnel;
}

export function computeConversions(funnel: FunnelCounts): ConversionRates {
  const appliedPool = funnel.applied + funnel.interviewing + funnel.offer + funnel.rejected;
  const interviewPool = funnel.interviewing + funnel.offer + funnel.rejected;
  const decided = funnel.offer + funnel.rejected;

  return {
    appliedToInterview: appliedPool > 0 ? Math.round((interviewPool / appliedPool) * 100) : 0,
    interviewToOffer: decided > 0 ? Math.round((funnel.offer / decided) * 100) : 0,
    overallOfferRate: funnel.total > 0 ? Math.round((funnel.offer / funnel.total) * 100) : 0,
  };
}

export function computeMedianDaysInStage(applications: JobApplication[]): Record<string, number> {
  const byStatus: Record<string, number[]> = {};

  for (const app of applications) {
    const history = app.statusHistory ?? [{ status: app.status, date: app.dateApplied }];
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const nextDate = i + 1 < history.length ? history[i + 1].date : new Date().toISOString();
      const days = daysBetween(entry.date, nextDate);
      if (!byStatus[entry.status]) byStatus[entry.status] = [];
      byStatus[entry.status].push(days);
    }
  }

  const median: Record<string, number> = {};
  for (const [status, days] of Object.entries(byStatus)) {
    const sorted = [...days].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median[status] = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }
  return median;
}

export function computeCriteriaVsOutcome(applications: JobApplication[]) {
  return applications
    .filter(a => a.status !== JobStatus.SAVED)
    .map(a => ({ score: a.criteriaScore, status: a.status, company: a.company }));
}

export function computeProtocolCompletionRate(
  logs: Record<string, DailyLog>,
  tasks: TaskDefinition[],
  daysBack = 28
): number {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < daysBack; i++) {
    dates.push(getLocalDateString(d));
    d.setDate(d.getDate() - 1);
  }
  const complete = dates.filter(date => {
    const log = logs[date];
    return log && tasks.every(t => log.completions[t.id]);
  }).length;
  return Math.round((complete / daysBack) * 100);
}

export function computeDaysInSearch(state: AppState): number {
  const dates: string[] = [];
  for (const app of state.applications) {
    if (app.status !== JobStatus.SAVED) dates.push(app.dateApplied);
  }
  for (const date of Object.keys(state.dailyLogs)) {
    dates.push(date);
  }
  if (dates.length === 0) return 0;
  const earliest = dates.sort()[0];
  return daysBetween(earliest, new Date().toISOString());
}

export function computeProjectedPace(applications: JobApplication[], targetApps = 50) {
  const applied = applications.filter(a => a.status !== JobStatus.SAVED);
  if (applied.length === 0) return { appsPerWeek: 0, weeksToTarget: null };

  const sorted = [...applied].sort((a, b) => a.dateApplied.localeCompare(b.dateApplied));
  const spanWeeks = Math.max(1, daysBetween(sorted[0].dateApplied, new Date().toISOString()) / 7);
  const appsPerWeek = Math.round((applied.length / spanWeeks) * 10) / 10;
  const remaining = Math.max(0, targetApps - applied.length);
  const weeksToTarget = appsPerWeek > 0 ? Math.ceil(remaining / appsPerWeek) : null;

  return { appsPerWeek, weeksToTarget };
}

export function buildAnalyticsSnapshot(
  state: AppState,
  tasks: TaskDefinition[],
  streakDays: number
): AnalyticsSnapshot {
  const funnel = computeFunnel(state.applications);
  return {
    appsPerWeek: computeAppsPerWeek(state.applications),
    funnel,
    conversions: computeConversions(funnel),
    medianDaysInStage: computeMedianDaysInStage(state.applications),
    criteriaVsOutcome: computeCriteriaVsOutcome(state.applications),
    protocolCompletionRate: computeProtocolCompletionRate(state.dailyLogs, tasks),
    streakDays,
    daysInSearch: computeDaysInSearch(state),
    projectedPace: computeProjectedPace(state.applications),
  };
}
