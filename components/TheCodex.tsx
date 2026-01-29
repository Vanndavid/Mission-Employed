
import React from 'react';
import { MENTAL_RULES } from '../constants';

export const TheCodex: React.FC = () => {
  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-3xl font-bold">The Codex</h2>
        <p className="text-slate-400 mt-2">Non-negotiable rules for the mission.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h3 className="text-xl font-bold text-rose-500 flex items-center"><span className="mr-2">❌</span> HARD NEGATIVES</h3>
          <ul className="space-y-4">
            {MENTAL_RULES.donts.map((rule, i) => (
              <li key={i} className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl text-slate-300 font-medium">{rule}</li>
            ))}
          </ul>
        </section>
        <section className="space-y-6">
          <h3 className="text-xl font-bold text-emerald-500 flex items-center"><span className="mr-2">✅</span> HARD POSITIVES</h3>
          <ul className="space-y-4">
            {MENTAL_RULES.dos.map((rule, i) => (
              <li key={i} className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl text-slate-300 font-medium">{rule}</li>
            ))}
          </ul>
        </section>
      </div>
      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        <h3 className="text-xl font-bold mb-6">Phase 2 Guidelines</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Volume</h4><p className="text-lg font-bold">2 Applications / Day</p></div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Consistency</h4><p className="text-lg font-bold">Same CV & Cover Letter</p></div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Mindset</h4><p className="text-lg font-bold text-rose-400">No Emotional Analysis</p></div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Target</h4><p className="text-lg font-bold">Mechanical Targets Only</p></div>
        </div>
      </div>
    </div>
  );
};
