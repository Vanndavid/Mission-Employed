
import React, { useMemo } from 'react';
import { AppState, TaskDefinition } from '../types';
import { buildAnalyticsSnapshot } from '../utils/analytics';
import { calculateStreak } from '../utils';
import { getTasksForPersona } from '../constants';
import { JobStatus } from '../types';

interface AnalyticsProps {
  state: AppState;
}

export const Analytics = ({ state }: AnalyticsProps) => {
  const tasks: TaskDefinition[] = useMemo(
    () => getTasksForPersona(state.huntPersona),
    [state.huntPersona]
  );
  const streak = useMemo(() => calculateStreak(state.dailyLogs, tasks), [state.dailyLogs, tasks]);
  const snapshot = useMemo(
    () => buildAnalyticsSnapshot(state, tasks, streak),
    [state, tasks, streak]
  );

  const maxWeekCount = Math.max(...snapshot.appsPerWeek.map(w => w.count), 1);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Hunt Command Center</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Cold metrics. No narrative. Just progress.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Current Streak" value={`${snapshot.streakDays} days`} />
        <StatCard label="Days in Search" value={`${snapshot.daysInSearch}`} />
        <StatCard label="Protocol Rate (28d)" value={`${snapshot.protocolCompletionRate}%`} />
        <StatCard label="Apps / Week" value={`${snapshot.projectedPace.appsPerWeek}`} />
      </div>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-4">Applications per Week</h3>
        {snapshot.appsPerWeek.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No applications logged yet.</p>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {snapshot.appsPerWeek.map(w => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-emerald-600">{w.count}</span>
                <div
                  className="w-full bg-emerald-500 rounded-t transition-all"
                  style={{ height: `${(w.count / maxWeekCount) * 100}%`, minHeight: w.count > 0 ? '8px' : '2px' }}
                />
                <span className="text-[9px] text-slate-400 truncate w-full text-center">
                  {new Date(w.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-4">Pipeline Funnel</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([
            ['Saved', snapshot.funnel.saved],
            ['Applied', snapshot.funnel.applied],
            ['Interviewing', snapshot.funnel.interviewing],
            ['Offer', snapshot.funnel.offer],
            ['Rejected', snapshot.funnel.rejected],
          ] as const).map(([label, count]) => (
            <div key={label} className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{count}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{label}</p>
              {snapshot.funnel.total > 0 && (
                <p className="text-[10px] text-emerald-600 mt-1">
                  {Math.round((count / snapshot.funnel.total) * 100)}%
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold mb-4">Conversion Rates</h3>
          <div className="space-y-3">
            <RateRow label="Applied → Interview" value={snapshot.conversions.appliedToInterview} />
            <RateRow label="Interview → Offer" value={snapshot.conversions.interviewToOffer} />
            <RateRow label="Overall Offer Rate" value={snapshot.conversions.overallOfferRate} />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold mb-4">Median Days in Stage</h3>
          {Object.keys(snapshot.medianDaysInStage).length === 0 ? (
            <p className="text-sm text-slate-400 italic">Not enough data yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(snapshot.medianDaysInStage).map(([status, days]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{status}</span>
                  <span className="font-bold">{days} days</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-4">Criteria Score vs Outcome</h3>
        {snapshot.criteriaVsOutcome.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Apply to roles to validate your criteria gate.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2">Company</th>
                <th className="text-left py-2">Score</th>
                <th className="text-left py-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.criteriaVsOutcome.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2">{row.company}</td>
                  <td className="py-2 font-bold">{row.score}</td>
                  <td className="py-2">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {snapshot.projectedPace.weeksToTarget !== null && (
        <section className="bg-slate-900 text-white rounded-2xl p-6">
          <h3 className="text-lg font-bold text-emerald-400 mb-2">Projected Pace</h3>
          <p className="text-slate-300 text-sm">
            At {snapshot.projectedPace.appsPerWeek} apps/week, you reach 50 applications in approximately{' '}
            <span className="font-bold text-white">{snapshot.projectedPace.weeksToTarget} weeks</span>.
          </p>
        </section>
      )}
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1">{value}</p>
    </div>
  );
}

function RateRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const colors: Record<string, string> = {
    [JobStatus.APPLIED]: 'text-emerald-600',
    [JobStatus.INTERVIEWING]: 'text-amber-600',
    [JobStatus.OFFER]: 'text-sky-600',
    [JobStatus.REJECTED]: 'text-slate-500',
    [JobStatus.SAVED]: 'text-slate-400',
  };
  return <span className={`font-bold text-xs ${colors[status] ?? ''}`}>{status}</span>;
}
