import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PREMIUM_FEATURES } from '../types/auth';

export function AccountPage() {
  const { user, isPremium, isAdmin, logout, refreshUser } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Account</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Plan controls which AI coaching features are unlocked.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Signed in as</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-1 break-all">{user.email}</p>
          <p className="text-xs text-slate-500 mt-2">
            Role: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.role}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current plan</p>
          <p className="text-lg font-semibold mt-1">
            <span
              className={
                isPremium
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-200'
              }
            >
              {isPremium ? 'Premium' : 'Free'}
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {isPremium
              ? 'AI coaching endpoints are unlocked.'
              : 'Core hunt tools work. AI features stay locked until an admin upgrades you.'}
          </p>
          <button
            type="button"
            onClick={() => void refreshUser()}
            className="mt-3 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400"
          >
            Refresh plan status
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Premium unlocks</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PREMIUM_FEATURES.map(feature => (
            <li
              key={feature}
              className={`text-sm ${isPremium ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}
            >
              {isPremium ? '✓' : '○'} {feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        {isAdmin && (
          <NavLink
            to="/account/admin"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest"
          >
            Admin · Manage plans
          </NavLink>
        )}
        <button
          type="button"
          onClick={logout}
          className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
