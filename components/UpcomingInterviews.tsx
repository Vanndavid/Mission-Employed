
import React from 'react';
import { JobApplication } from '../types';
import { INTERVIEW_STAGE_LABELS } from '../constants';

interface UpcomingInterviewsProps {
  applications: JobApplication[];
  onSelectApp?: (appId: string) => void;
}

export const UpcomingInterviews = ({ applications, onSelectApp }: UpcomingInterviewsProps) => {
  const now = new Date();
  const weekLater = new Date(now);
  weekLater.setDate(weekLater.getDate() + 7);

  const upcoming = applications
    .flatMap(app =>
      (app.interviewStages ?? [])
        .filter(s => s.scheduledAt)
        .map(stage => ({ app, stage }))
    )
    .filter(({ stage }) => {
      const d = new Date(stage.scheduledAt);
      return d >= now && d <= weekLater;
    })
    .sort((a, b) => a.stage.scheduledAt.localeCompare(b.stage.scheduledAt));

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-xl font-bold mb-4 flex items-center">
        <span className="mr-2">📆</span> Upcoming Interviews (7 days)
      </h3>
      {upcoming.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No interviews scheduled in the next 7 days.</p>
      ) : (
        <div className="space-y-3">
          {upcoming.map(({ app, stage }) => {
            const d = new Date(stage.scheduledAt);
            const isSoon = d.getTime() - now.getTime() < 48 * 60 * 60 * 1000;
            return (
              <button
                key={`${app.id}-${stage.id}`}
                onClick={() => onSelectApp?.(app.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  isSoon
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{app.company}</p>
                    <p className="text-sm text-slate-500">{INTERVIEW_STAGE_LABELS[stage.type] ?? stage.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-400">
                      {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                {isSoon && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-bold uppercase tracking-widest">
                    Prep now — less than 48h
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
