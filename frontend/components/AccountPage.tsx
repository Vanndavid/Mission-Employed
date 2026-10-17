import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { ALWAYS_INCLUDED, FeatureAllowance, PlanInfo, Subscription } from '../types/auth';
import { errorMessage } from '../services/http';
import {
  describeSetting,
  describeUsage,
  formatPlanDate,
  hasLapsed,
  isUsedUp,
  usageFraction,
} from '../utils/planFormat';
import { useToast } from './ToastProvider';

const card = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5';
const label = 'text-[10px] font-bold uppercase tracking-widest text-slate-400';
const quietButton =
  'px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50';

function formatResets(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * The account's plan: what it includes, how much of each allowance is left,
 * and the plans side by side with a way to ask for Premium.
 *
 * There is no payment integration. "Request Premium" flags the account for an
 * admin, who switches it over from the users screen.
 */
export function AccountPage() {
  const { user, isAdmin, logout, refreshUser } = useAuth();
  const { subscription, error, refresh } = useSubscription();

  // Usage moves with every AI request, so read it fresh whenever the page opens.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Plan & usage</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          What your plan includes, how much of it is left, and what Premium adds.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <p className={label}>Signed in as</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-1 break-all">{user.email}</p>
          <p className="text-xs text-slate-500 mt-2">
            Role: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.role}</span>
          </p>
        </div>
        <CurrentPlanCard subscription={subscription} isAdmin={isAdmin} onRefresh={() => void refreshUser()} />
      </div>

      {error && !subscription && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}{' '}
          <button type="button" onClick={() => void refresh()} className="font-bold underline">
            Retry
          </button>
        </div>
      )}

      {subscription && <UsageSection subscription={subscription} />}
      {subscription && <ComparePlans subscription={subscription} isAdmin={isAdmin} />}

      <div className="flex flex-wrap gap-3">
        {isAdmin && (
          <>
            <NavLink to="/account/admin" className={quietButton}>
              Admin · Users & usage
            </NavLink>
            <NavLink to="/account/admin/plans" className={quietButton}>
              Admin · Plans & limits
            </NavLink>
          </>
        )}
        <button type="button" onClick={logout} className={quietButton}>
          Log out
        </button>
      </div>
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  isAdmin,
  onRefresh,
}: {
  subscription: Subscription | null;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const plan = subscription?.plans.find(p => p.key === subscription.plan);
  const premium = subscription?.plan === 'premium';
  const end = subscription?.planExpiresAt ?? null;

  let detail: string;
  if (!subscription) detail = 'Loading your plan…';
  else if (isAdmin) detail = 'Admins have every feature, with no limits.';
  else if (premium) detail = end ? `Premium until ${formatPlanDate(end)}.` : 'Premium, with no end date.';
  else if (end && hasLapsed(end)) detail = `Your Premium plan ended on ${formatPlanDate(end)}.`;
  else detail = 'Free. The tracker and its tools are yours to keep; Premium adds the AI coaching.';

  return (
    <div className={card}>
      <p className={label}>Current plan</p>
      <p className="text-lg font-semibold mt-1">
        <span className={premium ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}>
          {plan?.name ?? (premium ? 'Premium' : 'Free')}
        </span>
        {plan?.priceLabel && <span className="ml-2 text-sm font-normal text-slate-400">{plan.priceLabel}</span>}
      </p>
      <p className="text-xs text-slate-500 mt-2">{detail}</p>
      {subscription?.requestsPerMinute != null && (
        <p className="text-xs text-slate-400 mt-1">
          Up to {subscription.requestsPerMinute} AI requests a minute, all features combined.
        </p>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="mt-3 text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400"
      >
        Refresh plan status
      </button>
    </div>
  );
}

function UsageSection({ subscription }: { subscription: Subscription }) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureAllowance[]>();
    for (const feature of subscription.features) {
      byGroup.set(feature.group, [...(byGroup.get(feature.group) ?? []), feature]);
    }
    return [...byGroup.entries()];
  }, [subscription.features]);

  return (
    <section className={card}>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Your allowances</h3>
      <p className="text-xs text-slate-500 mt-1">
        Each AI request counts as one use. Requests that fail cost nothing. Allowances reset on UTC days, Monday-start weeks and calendar months.
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {groups.map(([group, features]) => (
          <div key={group}>
            <p className={label}>{group}</p>
            <ul className="mt-2 space-y-3">
              {features.map(feature => (
                <UsageRow key={feature.key} feature={feature} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageRow({ feature }: { feature: FeatureAllowance }) {
  const full = isUsedUp(feature);

  return (
    <li className={feature.enabled ? undefined : 'opacity-60'}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200" title={feature.description}>
          {feature.name}
        </span>
        <span className={`text-xs tabular-nums ${full ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500'}`}>
          {describeUsage(feature)}
        </span>
      </div>
      {feature.enabled && feature.limit !== null && (
        <>
          <div
            className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
            role="meter"
            aria-label={`${feature.name} used`}
            aria-valuemin={0}
            aria-valuemax={feature.limit}
            aria-valuenow={Math.min(feature.used, feature.limit)}
          >
            <div
              className={`h-full rounded-full ${full ? 'bg-rose-500' : 'bg-brand-500'}`}
              style={{ width: `${usageFraction(feature) * 100}%` }}
            />
          </div>
          {full && feature.resetsAt && (
            <p className="text-[11px] text-slate-400 mt-1">Comes back {formatResets(feature.resetsAt)}</p>
          )}
        </>
      )}
    </li>
  );
}

function ComparePlans({ subscription, isAdmin }: { subscription: Subscription; isAdmin: boolean }) {
  const names = new Map(subscription.features.map(f => [f.key, f.name]));

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Plans</h3>
      <p className="text-xs text-slate-500 mt-1">
        Every plan includes: {ALWAYS_INCLUDED.join(' · ')}.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {subscription.plans.map(plan => (
          <PlanCard
            key={plan.key}
            plan={plan}
            names={names}
            current={plan.key === subscription.plan}
            action={plan.key === 'premium' && !isAdmin ? <PremiumRequest subscription={subscription} /> : null}
          />
        ))}
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  names,
  current,
  action,
}: {
  plan: PlanInfo;
  names: Map<string, string>;
  current: boolean;
  action: React.ReactNode;
}) {
  return (
    <div
      className={`${card} flex flex-col ${current ? 'ring-2 ring-brand-500/60 border-brand-300 dark:border-brand-500/40' : ''}`}
      aria-label={`${plan.name} plan`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{plan.name}</h4>
        {current && (
          <span className="rounded bg-brand-100 dark:bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            Your plan
          </span>
        )}
      </div>
      {plan.priceLabel && <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{plan.priceLabel}</p>}
      {plan.description && <p className="text-xs text-slate-500 mt-2">{plan.description}</p>}
      <ul className="mt-4 space-y-1.5 text-sm flex-1">
        {plan.features.map(feature => (
          <li key={feature.key} className="flex justify-between gap-3">
            <span className={feature.enabled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through decoration-slate-300'}>
              {feature.enabled ? '✓' : '○'} {names.get(feature.key) ?? feature.key}
            </span>
            {feature.enabled && <span className="text-xs text-slate-500 tabular-nums">{describeSetting(feature)}</span>}
          </li>
        ))}
      </ul>
      {plan.requestsPerMinute != null && (
        <p className="text-[11px] text-slate-400 mt-3">Up to {plan.requestsPerMinute} AI requests a minute</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function PremiumRequest({ subscription }: { subscription: Subscription }) {
  const { requestPremium, withdrawPremiumRequest } = useSubscription();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (subscription.plan === 'premium') return null;

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done, 'success');
    } catch (cause) {
      toast(errorMessage(cause, 'That did not go through. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (subscription.premiumRequestedAt) {
    return (
      <div className="text-xs text-slate-500">
        <p>
          You asked for Premium on {formatPlanDate(subscription.premiumRequestedAt)}. An admin will switch your account over.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(withdrawPremiumRequest, 'Request withdrawn.')}
          className="mt-2 font-bold uppercase tracking-widest text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
        >
          Withdraw request
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run(requestPremium, 'Request sent. An admin will switch your account over.')}
      className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
    >
      Request Premium
    </button>
  );
}
