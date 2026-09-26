import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthUser, AccountPlan } from '../types/auth';
import { fetchAdminUsage, listAdminUsers, setUserPlan, UsageReport, UsageSummary } from '../services/authClient';
import { featureLabel, formatCost, formatTokens } from '../utils/usageFormat';
import { useToast } from './ToastProvider';

const WINDOWS = [7, 30, 90] as const;

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
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [days, setDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

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

  // Heaviest users first, so the ones driving cost are at the top.
  const rows = useMemo(
    () =>
      users
        .map(user => ({ user, usage: usageById.get(user.id) }))
        .sort(
          (a, b) =>
            (b.usage?.window.totalTokens ?? 0) - (a.usage?.window.totalTokens ?? 0) ||
            (b.usage?.allTime.totalTokens ?? 0) - (a.usage?.allTime.totalTokens ?? 0),
        ),
    [users, usageById],
  );

  const windowTotal = useMemo(
    () =>
      (usage?.users ?? []).reduce(
        (sum, u) => ({ tokens: sum.tokens + u.window.totalTokens, cost: sum.cost + u.window.costUsd }),
        { tokens: 0, cost: 0 },
      ),
    [usage],
  );

  if (!isAdmin) return <Navigate to="/account" replace />;

  const changePlan = async (userId: number, plan: AccountPlan) => {
    setBusyId(userId);
    try {
      const res = await setUserPlan(userId, plan);
      setUsers(prev => prev.map(u => (u.id === userId ? res.user : u)));
      toast(`Updated to ${plan}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Users & usage</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Unlock Premium for any account, and see who is using how much AI. Costs are estimates at list price.
        </p>
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
                <tr>
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100 break-all">{user.email}</td>
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
                    {user.role === 'admin' ? (
                      <span className="text-xs text-slate-400">Always premium</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === user.id || user.plan === 'free'}
                          onClick={() => void changePlan(user.id, 'free')}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          Free
                        </button>
                        <button
                          type="button"
                          disabled={busyId === user.id || user.plan === 'premium'}
                          onClick={() => void changePlan(user.id, 'premium')}
                          className="px-2 py-1 rounded bg-brand-600 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          Premium
                        </button>
                      </div>
                    )}
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
