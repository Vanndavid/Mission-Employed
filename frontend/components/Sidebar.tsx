import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { checkHealth } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { sidebarTabs } from '../utils/navTabs';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({ mobileOpen, onMobileClose }: SidebarProps) => {
  const { user, isPremium, isAdmin, hiddenTabs, logout } = useAuth();
  const { canUse } = useSubscription();
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then(() => {
        if (!cancelled) setAiStatus('online');
      })
      .catch(() => {
        if (!cancelled) setAiStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The features, minus any an admin has hidden from users.
  const tabs = sidebarTabs(hiddenTabs, isAdmin).map(tab =>
    tab.key === 'mock_test' && !canUse('mock_interview') ? { ...tab, sub: 'Premium unlock' } : tab,
  );

  // Pages nobody needs every day, kept apart beside Log out so the features
  // above are what the sidebar is about.
  const accountLinks = [
    ...(isAdmin
      ? [
          { path: '/account/admin', label: 'Admin', icon: '🔑' },
          { path: '/account/admin/plans', label: 'Plans & Limits', icon: '🎛️' },
        ]
      : []),
    { path: '/account', label: 'Plan & Usage', icon: '👤' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

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
              aiStatus === 'online'
                ? 'bg-brand-500'
                : aiStatus === 'offline'
                  ? 'bg-rose-500'
                  : 'bg-amber-400 animate-pulse'
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

      <nav aria-label="Main" className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
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
              } ${tab.hidden ? 'opacity-60' : ''}`
            }
          >
            <div className="flex items-center">
              <span className="mr-3 text-lg">{tab.icon}</span>
              <span className="text-sm font-bold">{tab.label}</span>
            </div>
            <span className="text-[10px] ml-8 uppercase tracking-tighter font-medium text-slate-400">
              {tab.hidden ? 'Hidden from users' : tab.sub}
            </span>
          </NavLink>
        ))}
      </nav>

      <nav aria-label="Account" className="px-4 py-3 space-y-0.5 border-t border-slate-200 dark:border-slate-800">
        {accountLinks.map(link => (
          <NavLink
            key={link.path}
            to={link.path}
            end
            onClick={onMobileClose}
            className={({ isActive }) =>
              `w-full flex items-center px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`
            }
          >
            <span className="mr-3 text-sm">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
        <button
          onClick={() => {
            onMobileClose();
            logout();
          }}
          className="w-full mt-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
          Log out
        </button>
      </nav>
    </>
  );

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onMobileClose} aria-hidden />}

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

export const MobileHeader = ({ onMenuOpen }: { onMenuOpen: () => void }) => (
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
