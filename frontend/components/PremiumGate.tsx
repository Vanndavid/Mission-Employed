import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { FeatureKey } from '../types/auth';

/**
 * Shows its children when the account's plan includes every feature named,
 * and otherwise says why not: a Premium feature, or one switched off for
 * everyone. Which features each plan has is the admin's call, so this asks
 * the subscription rather than assuming "AI means Premium".
 *
 * A courtesy only. The `feature` middleware is the enforcement.
 */
export function PremiumGate({
  feature,
  children,
  title = 'Premium feature',
}: {
  feature: FeatureKey | FeatureKey[];
  children?: React.ReactNode;
  title?: string;
}) {
  const { canUse, premiumIncludes, allowance } = useSubscription();
  const locked = (Array.isArray(feature) ? feature : [feature]).filter(key => !canUse(key));

  if (locked.length === 0) return <>{children}</>;

  const upgradeHelps = locked.every(premiumIncludes);
  const names = locked.map(key => allowance(key)?.name).filter(Boolean);

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-6">
      <h3 className="text-lg font-bold text-amber-800 dark:text-amber-300">{title}</h3>
      <p className="text-sm text-amber-900/80 dark:text-amber-200/80 mt-2">
        {upgradeHelps
          ? 'This is locked on your plan and included with Premium. Request Premium from the Plan & usage page and an admin will switch your account over.'
          : 'This is not available on your plan right now.'}
      </p>
      {names.length > 0 && (
        <ul className="mt-4 grid gap-1 sm:grid-cols-2 text-xs text-amber-900/70 dark:text-amber-100/70">
          {names.map(name => (
            <li key={name}>• {name}</li>
          ))}
        </ul>
      )}
      <NavLink
        to="/account"
        className="inline-block mt-5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase tracking-widest"
      >
        {upgradeHelps ? 'See plans' : 'View your plan'}
      </NavLink>
    </div>
  );
}
