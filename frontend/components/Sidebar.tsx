import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { checkHealth } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ColorMode,
  ThemePalette,
  THEME_PALETTE_IDS,
  THEME_PALETTES,
} from '../themes';

interface SidebarProps {
  mode: ColorMode;
  palette: ThemePalette;
  onModeChange: (mode: ColorMode) => void;
  onPaletteChange: (palette: ThemePalette) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({
  mode,
  palette,
  onModeChange,
  onPaletteChange,
  mobileOpen,
  onMobileClose,
}: SidebarProps) => {
  const { user, isPremium, isAdmin, logout } = useAuth();
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then(() => { if (!cancelled) setAiStatus('online'); })
      .catch(() => { if (!cancelled) setAiStatus('offline'); });
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { path: '/dashboard', label: 'Mission Control', sub: 'Coding Practice', icon: '🚀', end: true },
    { path: '/applications', label: 'Job Applications', sub: 'Mechanical Applying', icon: '📁', end: true },
    { path: '/applications/profile', label: 'CV & Profile', sub: 'Frozen Documents', icon: '📄', end: false },
    { path: '/prep', label: 'Training Room', sub: 'Behavioral Drills', icon: '🧠', end: true },
    { path: '/mock', label: 'Mock Test', sub: isPremium ? 'Conversational Sim' : 'Premium unlock', icon: '👔', end: true },
    { path: '/account', label: 'Account', sub: isPremium ? 'Premium plan' : 'Free plan', icon: '👤', end: true },
  ];

  if (isAdmin) {
    tabs.push({ path: '/account/admin', label: 'Admin', sub: 'Unlock plans', icon: '🔑', end: true });
  }

  const navContent = (
    <>
      <div className="p-6">
        <h1 className="text-xl font-bold text-brand-600 dark:text-brand-500 tracking-tight">ONE PARTNER</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-semibold">
          Mission: Employed
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              aiStatus === 'online' ? 'bg-brand-500' : aiStatus === 'offline' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            AI {aiStatus === 'checking' ? 'checking...' : aiStatus}
          </span>
          <span
            className={`ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
              isPremium
                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {isPremium ? 'Premium' : 'Free'}
          </span>
        </div>
        {user && (
          <p className="mt-2 text-[10px] text-slate-400 truncate" title={user.email}>
            {user.email}
          </p>
        )}
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
                  ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-500/20 shadow-sm'
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

      <div className="px-4 py-2 space-y-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Theme</p>
            <div className="grid grid-cols-4 gap-2">
              {THEME_PALETTE_IDS.map(id => {
                const cfg = THEME_PALETTES[id];
                const selected = palette === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={`${cfg.label} — ${cfg.description}`}
                    onClick={() => onPaletteChange(id)}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 border transition-all ${
                      selected
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                        : 'border-transparent hover:border-slate-200 dark:hover:border-slate-600'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full border border-black/10 shadow-sm"
                      style={{ backgroundColor: cfg.swatch }}
                    />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onModeChange('light')}
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                mode === 'light'
                  ? 'bg-brand-600 text-white'
                  : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => onModeChange('dark')}
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                mode === 'dark'
                  ? 'bg-brand-600 text-white'
                  : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Dark
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            onMobileClose();
            logout();
          }}
          className="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
          Log out
        </button>
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
        className={`w-64 bg-white/90 dark:bg-slate-900/95 backdrop-blur border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </div>
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
      <p className="text-sm font-bold text-brand-600">ONE PARTNER</p>
      <p className="text-[9px] uppercase tracking-widest text-slate-400">Mission: Employed</p>
    </div>
    <div className="w-10" />
  </header>
);
