import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthUser, AccountPlan } from '../types/auth';
import {
  dismissPremiumRequest,
  fetchAdminUsage,
  listAdminUsers,
  setUserActive,
  setUserPlan,
  UsageReport,
  UsageSummary,
} from '../services/authClient';
import { featureLabel, formatCost, formatTokens } from '../utils/usageFormat';
import { extendPremiumUntil, formatPlanDate, hasLapsed } from '../utils/planFormat';
import { useToast } from './ToastProvider';

const WINDOWS = [7, 30, 90] as const;

/** How long a grant of Premium runs. null: no end date. */
const DURATIONS: { months: number | null; label: string }[] = [
  { months: 1, label: '1 month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '12 months' },
  { months: null, label: 'No end date' },
];

const EMPTY_USAGE: UsageSummary = {
  calls: 0,
  promptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  unpricedCalls: 0,
  lastUsedAt: null,
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
}

export function AdminUsersPage() {
  const { isAdmin, user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [days, setDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  /** The duration picked on each row, by user id. Unset reads as one month. */
  const [durations, setDurations] = useState<Record<number, number | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers();
      setUsers(res.users);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchAdminUsage(days)
      .then(report => {
        if (!cancelled) setUsage(report);
      })
      .catch(e => toast(e instanceof Error ? e.message : 'Failed to load usage', 'error'));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, days]);

  const usageById = useMemo(() => new Map(usage?.users.map(u => [u.userId, u]) ?? []), [usage]);

  // Waiting Premium requests first, oldest first, so none is missed; then the
  // heaviest users, so the ones driving cost are at the top.
  const rows = useMemo(
    () =>
      users
        .map(user => ({ user, usage: usageById.get(user.id) }))
        .sort(
          (a, b) =>
            requestOrder(a.user) - requestOrder(b.user) ||
            (b.usage?.window.totalTokens ?? 0) - (a.usage?.window.totalTokens ?? 0) ||
            (b.usage?.allTime.totalTokens ?? 0) - (a.usage?.allTime.totalTokens ?? 0),
        ),
    [users, usageById],
  );

  const pendingRequests = users.filter(u => u.premiumRequestedAt).length;

  const windowTotal = useMemo(
    () =>
      (usage?.users ?? []).reduce(
        (sum, u) => ({ tokens: sum.tokens + u.window.totalTokens, cost: sum.cost + u.window.costUsd }),
        { tokens: 0, cost: 0 },
      ),
    [usage],
  );

  if (!isAdmin) return <Navigate to="/account" replace />;

  const changePlan = async (target: AuthUser, plan: AccountPlan) => {
    const months = durations[target.id] === undefined ? 1 : durations[target.id];
    // A grant runs on from an end date still ahead, so extending never shortens.
    const current = target.plan === 'premium' ? target.planExpiresAt ?? null : null;
    const expiresAt = plan === 'premium' ? extendPremiumUntil(current, months) : null;

    setBusyId(target.id);
    try {
      const res = await setUserPlan(target.id, plan, expiresAt);
      setUsers(prev => prev.map(u => (u.id === target.id ? res.user : u)));
      toast(
        plan === 'free'
          ? `${target.email} is on Free`
          : expiresAt
            ? `${target.email} has Premium until ${formatPlanDate(expiresAt)}`
            : `${target.email} has Premium with no end date`,
        'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const dismissRequest = async (target: AuthUser) => {
    setBusyId(target.id);
    try {
      const res = await dismissPremiumRequest(target.id);
      setUsers(prev => prev.map(u => (u.id === target.id ? res.user : u)));
      toast(`Dismissed ${target.email}'s request`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const changeActive = async (target: AuthUser, active: boolean) => {
    if (
      !active &&
      !window.confirm(
        `Deactivate ${target.email}? They are signed out everywhere and cannot sign in until reactivated. Their data is kept.`,
      )
    ) {
      return;
    }
    setBusyId(target.id);
    try {
      const res = await setUserActive(target.id, active);
      setUsers(prev => prev.map(u => (u.id === target.id ? res.user : u)));
      toast(active ? `Reactivated ${target.email}` : `Deactivated ${target.email}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Users & usage</h2>
          <NavLink
            to="/account/admin/plans"
            className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400 hover:underline"
          >
            Plans & limits →
          </NavLink>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Grant Premium for a period or for good, answer Premium requests, deactivate an account, and see who is using how
          much AI. Costs are estimates at list price.
        </p>
        {pendingRequests > 0 && (
          <p className="mt-3 inline-block rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {pendingRequests === 1 ? '1 account is' : `${pendingRequests} accounts are`} waiting for Premium — listed first.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span>Usage over</span>
          <select
            aria-label="Usage window"
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-100"
          >
            {WINDOWS.map(option => (
              <option key={option} value={option}>
                last {option} days
              </option>
            ))}
          </select>
        </label>
        {usage && (
          <span className="text-slate-500 dark:text-slate-400">
            {formatTokens(windowTotal.tokens)} tokens · about {formatCost(windowTotal.cost)} across all users
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-[10px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold">Email</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold text-right">Tokens ({days}d)</th>
                <th className="px-4 py-3 font-bold text-right">Est. cost ({days}d)</th>
                <th className="px-4 py-3 font-bold text-right">All-time cost</th>
                <th className="px-4 py-3 font-bold">Last used</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {rows.map(({ user, usage: used }) => {
                const recent = used?.window ?? EMPTY_USAGE;
                const ever = used?.allTime ?? EMPTY_USAGE;
                const open = openId === user.id;
                return (
                <Fragment key={user.id}>
                <tr className={user.deactivatedAt ? 'opacity-60' : undefined}>
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100 break-all">
                    {user.email}
                    {user.deactivatedAt && (
                      <span
                        title={`Since ${formatDate(user.deactivatedAt)}`}
                        className="ml-2 inline-block rounded bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300"
                      >
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{user.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.plan === 'premium'
                          ? 'text-brand-600 dark:text-brand-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300'
                      }
                    >
                      {user.plan}
                    </span>
                    {user.role !== 'admin' && <PlanTerm user={user} />}
                    {user.premiumRequestedAt && (
                      <span className="mt-1 block">
                        <span className="inline-block rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300">
                          Wants Premium · {formatPlanDate(user.premiumRequestedAt)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {recent.totalTokens > 0 ? (
                      <button
                        type="button"
                        aria-label={`Usage details for ${user.email}`}
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : user.id)}
                        className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                      >
                        {formatTokens(recent.totalTokens)}
                      </button>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                    {formatCost(recent.costUsd)}
                    {recent.unpricedCalls > 0 && (
                      <span className="block text-[10px] text-slate-400">+{recent.unpricedCalls} unpriced</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatCost(ever.costUsd)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(ever.lastUsedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {user.role === 'admin' ? (
                        <span className="text-xs text-slate-400">Always premium</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Move ${user.email} to Free`}
                            disabled={busyId === user.id || user.plan === 'free'}
                            onClick={() => void changePlan(user, 'free')}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                          >
                            Free
                          </button>
                          <select
                            aria-label={`Premium period for ${user.email}`}
                            value={String(durations[user.id] === undefined ? 1 : durations[user.id])}
                            onChange={e =>
                              setDurations(prev => ({
                                ...prev,
                                [user.id]: e.target.value === 'null' ? null : Number(e.target.value),
                              }))
                            }
                            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-[11px]"
                          >
                            {DURATIONS.map(d => (
                              <option key={String(d.months)} value={String(d.months)}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label={`${user.plan === 'premium' ? 'Extend' : 'Grant'} Premium for ${user.email}`}
                            disabled={busyId === user.id}
                            onClick={() => void changePlan(user, 'premium')}
                            className="px-2 py-1 rounded bg-brand-600 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                          >
                            {user.plan === 'premium' ? 'Extend' : 'Premium'}
                          </button>
                          {user.premiumRequestedAt && (
                            <button
                              type="button"
                              aria-label={`Dismiss ${user.email}'s Premium request`}
                              disabled={busyId === user.id}
                              onClick={() => void dismissRequest(user)}
                              className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                            >
                              Dismiss
                            </button>
                          )}
                        </>
                      )}
                      {user.id !== me?.id && (
                        <button
                          type="button"
                          aria-label={`${user.deactivatedAt ? 'Reactivate' : 'Deactivate'} ${user.email}`}
                          disabled={busyId === user.id}
                          onClick={() => void changeActive(user, Boolean(user.deactivatedAt))}
                          className={
                            user.deactivatedAt
                              ? 'px-2 py-1 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40'
                              : 'px-2 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40'
                          }
                        >
                          {user.deactivatedAt ? 'Reactivate' : 'Deactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {open && used && (
                  <tr className="bg-slate-50/60 dark:bg-slate-800/40">
                    <td colSpan={8} className="px-4 py-3">
                      <table className="w-full text-xs">
                        <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                          <tr>
                            <th className="py-1 font-bold">Feature</th>
                            <th className="py-1 font-bold text-right">Calls</th>
                            <th className="py-1 font-bold text-right">Tokens</th>
                            <th className="py-1 font-bold text-right">Est. cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {used.byFeature.map(feature => (
                            <tr key={`${feature.feature}-${feature.source}`}>
                              <td className="py-1 text-slate-700 dark:text-slate-200">
                                {featureLabel(feature.feature)}
                                {feature.source === 'live' && (
                                  <span className="ml-2 text-[10px] text-slate-400">reported by browser</span>
                                )}
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{feature.calls}</td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{formatTokens(feature.totalTokens)}</td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{formatCost(feature.costUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Waiting requests sort first, oldest first; everyone else after. */
function requestOrder(user: AuthUser): number {
  return user.premiumRequestedAt ? new Date(user.premiumRequestedAt).getTime() : Number.MAX_SAFE_INTEGER;
}

/** "until 18 Nov 2026", "no end date", or when a lapsed Premium plan ended. */
function PlanTerm({ user }: { user: AuthUser }) {
  const end = user.planExpiresAt ?? null;

  if (user.plan === 'premium') {
    return (
      <span className="block text-[11px] text-slate-400">{end ? `until ${formatPlanDate(end)}` : 'no end date'}</span>
    );
  }

  if (end && hasLapsed(end)) {
    return <span className="block text-[11px] text-slate-400">Premium ended {formatPlanDate(end)}</span>;
  }

  return null;
}
