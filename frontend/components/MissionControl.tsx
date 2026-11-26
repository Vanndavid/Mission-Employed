import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { ModeTabs } from './ModeTabs';
import { HISTORY_PATH } from '../utils/practiceLinks';

/**
 * Mission Control's frame: the heading and the mode tabs, with the mode on
 * screen below. Problems (Dashboard) is the index route and Quiz is
 * /dashboard/quiz; each sits behind its own TabGate in App.tsx. Practice
 * history (/dashboard/history) is not a mode tab: it is linked from here,
 * the coach and Recent attempts.
 */
export function MissionControl() {
  return (
    <div className="space-y-8">
      <header className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Software engineering practice: problems with an AI tutor, language quizzes, code reviews and system
              designs, with a coach for what to work on next, and where the rest of the hunt stands.
            </p>
          </div>
          <Link
            to={HISTORY_PATH}
            className="shrink-0 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-brand-400"
          >
            Progress & history
          </Link>
        </div>
        <ModeTabs tab="mission_control" />
      </header>
      <Outlet />
    </div>
  );
}
