
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { MENTAL_RULES } from '../constants';
import { EmergencyModal } from './EmergencyModal';
import { checkHealth } from '../services/apiClient';

interface SidebarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({ theme, toggleTheme, mobileOpen, onMobileClose }: SidebarProps) => {
  const [showEmergency, setShowEmergency] = useState(false);
  const [showDosDonts, setShowDosDonts] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const manifestoRule = MENTAL_RULES.manifesto[dayOfYear % MENTAL_RULES.manifesto.length];

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then(() => { if (!cancelled) setAiStatus('online'); })
      .catch(() => { if (!cancelled) setAiStatus('offline'); });
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { path: '/dashboard', label: 'Mission Control', sub: 'Checklist & Coding', icon: '🚀', end: true },
    { path: '/analytics', label: 'Hunt Command Center', sub: 'Analytics & Funnel', icon: '📊', end: true },
    { path: '/applications', label: 'Pipeline', sub: 'Mechanical Applying', icon: '📁', end: true },
    { path: '/applications/criteria', label: 'Personas & Criteria', sub: 'Protocol Config', icon: '⚙️', end: false },
    { path: '/applications/contacts', label: 'Contacts', sub: 'CRM & Follow-ups', icon: '📇', end: false },
    { path: '/applications/profile', label: 'CV & Profile', sub: 'Frozen Documents', icon: '📄', end: false },
    { path: '/applications/offers', label: 'Offer Tools', sub: 'Compare & Negotiate', icon: '💰', end: false },
    { path: '/prep', label: 'Training Room', sub: 'Behavioral & System Design', icon: '🧠', end: true },
    { path: '/mock', label: 'Mock Test', sub: 'Conversational Sim', icon: '👔', end: true },
    { path: '/rules', label: 'The Codex', sub: 'Mental Guidelines', icon: '📜', end: true },
  ];

  const navContent = (
    <>
      <div className="p-6">
        <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-500 tracking-tight">ONE PARTNER</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-semibold">
          Mission: Employed
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              aiStatus === 'online' ? 'bg-emerald-500' : aiStatus === 'offline' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            AI {aiStatus === 'checking' ? 'checking...' : aiStatus}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            onClick={onMobileClose}
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
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <div
        className={`w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </div>

      {showEmergency && <EmergencyModal onClose={() => setShowEmergency(false)} />}
    </>
  );
};

export const MobileHeader = ({
  onMenuOpen,
}: {
  onMenuOpen: () => void;
}) => (
  <header className="lg:hidden sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
    <button
      onClick={onMenuOpen}
      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
      aria-label="Open menu"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <div className="text-center">
      <p className="text-sm font-bold text-emerald-600">ONE PARTNER</p>
      <p className="text-[9px] uppercase tracking-widest text-slate-400">Mission: Employed</p>
    </div>
    <div className="w-10" />
  </header>
);
