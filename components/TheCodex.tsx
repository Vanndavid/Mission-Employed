
import React, { useState } from 'react';
import { MENTAL_RULES } from '../constants';

export const TheCodex = () => {
  const [showEmergency, setShowEmergency] = useState(false);
  const [committed, setCommitted] = useState(false);

  if (showEmergency) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center animate-in zoom-in duration-500">
        <div className="max-w-2xl w-full bg-slate-900 border-4 border-rose-600 p-12 rounded-3xl shadow-[0_0_50px_rgba(225,29,72,0.3)] text-center space-y-8">
          <div className="w-20 h-20 bg-rose-600 text-white rounded-full flex items-center justify-center text-4xl mx-auto animate-pulse">
            ⚠️
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">
            {MENTAL_RULES.emergency.message}
          </h2>
          <div className="space-y-4 text-left">
            {MENTAL_RULES.emergency.steps.map((step, i) => (
              <div key={i} className="flex items-start space-x-4 group">
                <span className="text-rose-500 font-mono font-bold pt-1">{i + 1}.0</span>
                <p className="text-slate-300 text-lg font-medium leading-tight group-hover:text-white transition-colors">{step}</p>
              </div>
            ))}
          </div>
          <button 
            onClick={() => setShowEmergency(false)}
            className="w-full py-4 bg-white text-slate-900 rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all shadow-xl"
          >
            Acknowledge & Resume Mission
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16 pb-20">
      <header className="text-center space-y-4">
        <h2 className="text-5xl font-black text-slate-900 dark:text-slate-50 tracking-tighter uppercase italic">
          The Protocol Codex
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
          The job search is not a career choice. It is a <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">military-grade mechanical operation</span> designed to result in one outcome: Employment.
        </p>
      </header>

      {/* The Manifesto */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {MENTAL_RULES.manifesto.map((item, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 text-slate-100 dark:text-slate-800 font-mono text-6xl font-black -z-0 group-hover:text-emerald-500/10 transition-colors">
              0{i+1}
            </div>
            <div className="relative z-10 space-y-4">
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">{item.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{item.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-8">
          <div className="flex items-center space-x-4 border-b-2 border-rose-500/20 pb-4">
            <span className="text-3xl">❌</span>
            <h3 className="text-2xl font-black text-rose-600 dark:text-rose-500 uppercase italic tracking-tighter">Operational Constraints</h3>
          </div>
          <ul className="space-y-4">
            {MENTAL_RULES.donts.map((rule, i) => (
              <li key={i} className="flex items-center space-x-4 bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-rose-500/30 transition-all">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-slate-700 dark:text-slate-300 font-bold text-sm tracking-tight">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-8">
          <div className="flex items-center space-x-4 border-b-2 border-emerald-500/20 pb-4">
            <span className="text-3xl">✅</span>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-500 uppercase italic tracking-tighter">Discipline Directives</h3>
          </div>
          <ul className="space-y-4">
            {MENTAL_RULES.dos.map((rule, i) => (
              <li key={i} className="flex items-center space-x-4 bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-emerald-500/30 transition-all">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-700 dark:text-slate-300 font-bold text-sm tracking-tight">{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Phase 2 Deep Dive */}
      <section className="bg-slate-900 text-white rounded-[3rem] p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -mr-32 -mt-32" />
        <div className="relative z-10">
          <h3 className="text-3xl font-black mb-10 text-emerald-400 uppercase italic tracking-tighter">Phase 2: The Mechanical Grind</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-2">
              <h4 className="text-emerald-500/60 font-mono text-xs font-bold uppercase tracking-widest">Daily Quota</h4>
              <p className="text-2xl font-black tracking-tight">2 Applications</p>
              <p className="text-slate-400 text-xs">Consistent, non-negotiable volume.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-emerald-500/60 font-mono text-xs font-bold uppercase tracking-widest">Documentation</h4>
              <p className="text-2xl font-black tracking-tight">Frozen CV</p>
              <p className="text-slate-400 text-xs">Stop tweaking. Start sending.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-emerald-500/60 font-mono text-xs font-bold uppercase tracking-widest">Target Score</h4>
              <p className="text-2xl font-black tracking-tight">4/8 Minimum</p>
              <p className="text-slate-400 text-xs">Strict mechanical filtering only.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-emerald-500/60 font-mono text-xs font-bold uppercase tracking-widest">Mental State</h4>
              <p className="text-2xl font-black tracking-tight">Cold Silence</p>
              <p className="text-slate-400 text-xs">Zero post-application analysis.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-10">
        <button 
          onClick={() => setShowEmergency(true)}
          className="px-10 py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl border-2 border-rose-500/30 font-black uppercase tracking-widest transition-all"
        >
          🆘 Emergency Protocol
        </button>
        <button 
          onClick={() => setCommitted(true)}
          disabled={committed}
          className={`px-10 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl ${
            committed 
            ? 'bg-emerald-500 text-white cursor-default scale-95 opacity-50' 
            : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105 active:scale-95'
          }`}
        >
          {committed ? '✔️ Committed for Today' : '🛡️ Commit to Protocol'}
        </button>
      </div>
    </div>
  );
};
