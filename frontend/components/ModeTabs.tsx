import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NavTabKey } from '../types/auth';
import { modeTabs, NAV_TABS } from '../utils/navTabs';

/**
 * The mode tabs under a tab's heading: Mission Control's Problems and Quiz.
 * Each is a tab an admin can hide; a user sees only the ones left, and no
 * bar at all when one is left. An admin sees them all, the hidden ones
 * marked.
 */
export function ModeTabs({ tab }: { tab: NavTabKey }) {
  const { isAdmin, hiddenTabs } = useAuth();
  const modes = modeTabs(tab, hiddenTabs, isAdmin);

  if (modes.length < 2) return null;

  const label = NAV_TABS.find(t => t.key === tab)?.label ?? tab;

  return (
    <nav aria-label={`${label} modes`} className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
      {modes.map(mode => (
        <NavLink
          key={mode.key}
          to={mode.path}
          end
          className={({ isActive }) =>
            `-mb-px px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
              isActive
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            } ${mode.hidden ? 'opacity-60' : ''}`
          }
        >
          {mode.label}
          {mode.hidden && (
            <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Hidden</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
