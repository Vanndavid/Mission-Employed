import React from 'react';
import { Outlet } from 'react-router-dom';
import { ModeTabs } from './ModeTabs';

/**
 * Mission Control's frame: the heading and the mode tabs, with the mode on
 * screen below. Problems (Dashboard) is the index route and Quiz is
 * /dashboard/quiz; each sits behind its own TabGate in App.tsx.
 */
export function MissionControl() {
  return (
    <div className="space-y-8">
      <header className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Software engineering practice, with an AI tutor or a quick quiz, and where the rest of the hunt stands.
          </p>
        </div>
        <ModeTabs tab="mission_control" />
      </header>
      <Outlet />
    </div>
  );
}
