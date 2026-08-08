import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PREMIUM_FEATURES } from '../types/auth';

export function PremiumGate({
  children,
  title = 'Premium feature',
}: {
  children?: React.ReactNode;
  title?: string;
}) {
  const { isPremium } = useAuth();
  if (isPremium) return <>{children}</>;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-6">
      <h3 className="text-lg font-bold text-amber-800 dark:text-amber-300">{title}</h3>
      <p className="text-sm text-amber-900/80 dark:text-amber-200/80 mt-2">
        This AI coaching tool is locked on Free. Ask an admin to set your account to Premium —
        payments can be wired up later.
      </p>
      <ul className="mt-4 grid gap-1 sm:grid-cols-2 text-xs text-amber-900/70 dark:text-amber-100/70">
        {PREMIUM_FEATURES.slice(0, 4).map(f => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
      <NavLink
        to="/account"
        className="inline-block mt-5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest"
      >
        View account plan
      </NavLink>
    </div>
  );
}
