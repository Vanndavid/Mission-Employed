
import React from 'react';
import { MENTAL_RULES } from '../constants';

export const TheCodex = () => {
  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">The Codex</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Non-negotiable rules for the mission.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h3 className="text-xl font-bold text-rose-600 dark:text-rose-500 flex items-center">
            <span className="mr-2">❌</span> HARD NEGATIVES
          </h3>
          <ul className="space-y-4">
            {MENTAL_RULES.donts.map((rule, i) => (
              <li key={i} className="bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10 p-4 rounded-xl text-slate-700 dark:text-slate-300 font-medium">
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-500 flex items-center">
            <span className="mr-2">✅</span> HARD POSITIVES
          </h3>
          <ul className="space-y-4">
            {MENTAL_RULES.dos.map((rule, i) => (
              <li key={i} className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 p-4 rounded-xl text-slate-700 dark:text-slate-300 font-medium">
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-slate-100">Phase 2 Guidelines</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Volume</h4>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">2 Applications / Day</p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Consistency</h4>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Same CV & Cover Letter</p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Mindset</h4>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">No Emotional Analysis</p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Target</h4>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Mechanical Targets Only</p>
          </div>
        </div>
      </div>
    </div>
  );
};
