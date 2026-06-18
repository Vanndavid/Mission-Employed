
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { MENTAL_RULES } from '../constants';
import { EmergencyModal } from './EmergencyModal';

interface SidebarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Sidebar = ({ theme, toggleTheme }: SidebarProps) => {
  const [showEmergency, setShowEmergency] = useState(false);
  const [showDosDonts, setShowDosDonts] = useState(false);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const manifestoRule = MENTAL_RULES.manifesto[dayOfYear % MENTAL_RULES.manifesto.length];

  const tabs = [
    { path: '/dashboard', label: 'Mission Control', sub: 'Checklist & Coding', icon: '🚀' },
    { path: '/analytics', label: 'Hunt Command Center', sub: 'Analytics & Funnel', icon: '📊' },
    { path: '/applications', label: 'Pipeline', sub: 'Mechanical Applying', icon: '📁' },
    { path: '/applications/criteria', label: 'Personas & Criteria', sub: 'Protocol Config', icon: '⚙️' },
    { path: '/prep', label: 'Training Room', sub: 'Behavioral & System Design', icon: '🧠' },
    { path: '/mock', label: 'Mock Test', sub: 'Conversational Sim', icon: '👔' },
    { path: '/rules', label: 'The Codex', sub: 'Mental Guidelines', icon: '📜' },
  ];

  return (
    <>
      <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed left-0 top-0 transition-colors">
        <div className="p-6">
          <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-500 tracking-tight">ONE PARTNER</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-semibold">Mechanical Execution</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `w-full flex flex-col items-start px-4 py-3 rounded-lg transition-colors border ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent'
                }`
              }
            >
              <div className="flex items-center">
                <span className="mr-3 text-lg">{tab.icon}</span>
                <span className="text-sm font-bold">{tab.label}</span>
              </div>
              <span className="text-[10px] ml-8 uppercase tracking-tighter font-medium text-slate-400">
                {tab.sub}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-2 space-y-2">
          <button
            onClick={() => setShowEmergency(true)}
            className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/30 text-xs font-black uppercase tracking-widest transition-all"
          >
            🆘 Emergency Protocol
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
          >
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
            <span>{theme === 'light' ? '🌙' : '☀️'}</span>
          </button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 m-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Today's Rule</h3>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{manifestoRule.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{manifestoRule.body}</p>
          </div>
          <button
            onClick={() => setShowDosDonts(!showDosDonts)}
            className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400"
          >
            {showDosDonts ? 'Hide' : 'Show'} Dos / Don'ts
          </button>
          {showDosDonts && (
            <div className="space-y-2 text-[10px]">
              {MENTAL_RULES.dos.slice(0, 3).map((d, i) => (
                <p key={i} className="text-emerald-700 dark:text-emerald-400">✓ {d}</p>
              ))}
              {MENTAL_RULES.donts.slice(0, 2).map((d, i) => (
                <p key={i} className="text-rose-600 dark:text-rose-400">✗ {d}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEmergency && <EmergencyModal onClose={() => setShowEmergency(false)} />}
    </>
  );
};
