import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { AccountPlan, FeatureInfo, PlanInfo, QUOTA_PERIODS, QuotaPeriod } from '../types/auth';
import { fetchAdminPlans, updateAdminPlan } from '../services/subscriptionClient';
import { errorMessage } from '../services/http';
import { FeatureDraft, isDirty, PlanDraft, toDraft, toPatch } from '../utils/planDraft';
import { useToast } from './ToastProvider';

const input =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-800 dark:text-slate-100';

/**
 * The admin's plan editor: per plan, its name, price label, description and
 * requests-per-minute cap, and per feature whether it is included and how
 * many uses it allows per day, week or month.
 *
 * Features are a matrix, plans across and features down, so Free and Premium
 * can be compared while they are edited. Saving sends every plan that changed;
 * the server applies it to the next request.
 */
export function AdminPlansPage() {
  const { isAdmin } = useAuth();
  const { refresh: refreshOwnPlan } = useSubscription();
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<FeatureInfo[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<AccountPlan, PlanDraft>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchAdminPlans()
      .then(res => {
        if (cancelled) return;
        setCatalog(res.features);
        setPlans(res.plans);
        setDrafts(Object.fromEntries(res.plans.map(plan => [plan.key, toDraft(plan)])));
      })
      .catch(e => toast(errorMessage(e, 'Could not load the plans.'), 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const names = useMemo(() => new Map(catalog.map(f => [f.key, f.name])), [catalog]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureInfo[]>();
    for (const feature of catalog) byGroup.set(feature.group, [...(byGroup.get(feature.group) ?? []), feature]);
    return [...byGroup.entries()];
  }, [catalog]);

  const changed = plans.filter(plan => drafts[plan.key] && isDirty(drafts[plan.key]!, plan));

  if (!isAdmin) return <Navigate to="/account" replace />;

  const setPlanField = (plan: AccountPlan, field: Exclude<keyof PlanDraft, 'features'>, value: string) =>
    setDrafts(prev => ({ ...prev, [plan]: { ...prev[plan]!, [field]: value } }));

  const setFeature = (plan: AccountPlan, key: string, patch: Partial<FeatureDraft>) =>
    setDrafts(prev => {
      const draft = prev[plan]!;
      return { ...prev, [plan]: { ...draft, features: { ...draft.features, [key]: { ...draft.features[key], ...patch } } } };
    });

  const save = async () => {
    const patches = changed.map(plan => ({ plan, result: toPatch(drafts[plan.key]!, names) }));
    const invalid = patches.find(p => !p.result.ok);
    if (invalid && !invalid.result.ok) {
      toast(`${invalid.plan.name}: ${invalid.result.error}`, 'error');
      return;
    }

    setSaving(true);
    try {
      for (const { plan, result } of patches) {
        if (!result.ok) continue;
        const { plan: saved } = await updateAdminPlan(plan.key, result.patch);
        setPlans(prev => prev.map(p => (p.key === saved.key ? saved : p)));
        setDrafts(prev => ({ ...prev, [saved.key]: toDraft(saved) }));
      }
      toast('Plans saved. They apply from the next request.', 'success');
      void refreshOwnPlan();
    } catch (e) {
      toast(errorMessage(e, 'Could not save the plans.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDrafts(Object.fromEntries(plans.map(plan => [plan.key, toDraft(plan)])));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Plans & limits</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Decide what each plan includes and how often. A limit counts requests that reached the AI (or Seek); a blank
            limit is unlimited. Changes apply from the next request. Admins are never limited.
          </p>
        </div>
        <NavLink
          to="/account/admin"
          className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400 hover:underline"
        >
          Users & usage →
        </NavLink>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading plans…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="min-w-[720px] w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-left align-top">
                  <th className="px-4 py-3 w-1/4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</th>
                  {plans.map(plan => {
                    const draft = drafts[plan.key]!;
                    return (
                      <th key={plan.key} className="px-4 py-3 font-normal">
                        <div className="space-y-2">
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Name</span>
                            <input
                              aria-label={`${plan.key} name`}
                              className={input}
                              value={draft.name}
                              maxLength={60}
                              onChange={e => setPlanField(plan.key, 'name', e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Price label</span>
                            <input
                              aria-label={`${plan.key} price label`}
                              className={input}
                              value={draft.priceLabel}
                              maxLength={60}
                              placeholder="e.g. $9 / month"
                              onChange={e => setPlanField(plan.key, 'priceLabel', e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Description</span>
                            <textarea
                              aria-label={`${plan.key} description`}
                              className={`${input} h-16 resize-none`}
                              value={draft.description}
                              maxLength={500}
                              onChange={e => setPlanField(plan.key, 'description', e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              AI requests per minute
                            </span>
                            <input
                              aria-label={`${plan.key} requests per minute`}
                              className={input}
                              inputMode="numeric"
                              value={draft.requestsPerMinute}
                              placeholder="No cap"
                              onChange={e => setPlanField(plan.key, 'requestsPerMinute', e.target.value)}
                            />
                          </label>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {groups.map(([group, features]) => (
                  <Fragment key={group}>
                    <tr className="bg-slate-50/60 dark:bg-slate-800/40">
                      <td colSpan={plans.length + 1} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {group}
                      </td>
                    </tr>
                    {features.map(feature => (
                      <tr key={feature.key} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{feature.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{feature.description}</p>
                        </td>
                        {plans.map(plan => (
                          <FeatureCell
                            key={plan.key}
                            planName={plan.name}
                            featureName={feature.name}
                            draft={drafts[plan.key]!.features[feature.key]}
                            onChange={patch => setFeature(plan.key, feature.key, patch)}
                          />
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || changed.length === 0}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={saving || changed.length === 0}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-widest disabled:opacity-40"
            >
              Discard
            </button>
            {changed.length > 0 && (
              <span className="text-xs text-slate-500">Unsaved changes to {changed.map(p => p.name).join(' and ')}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FeatureCell({
  planName,
  featureName,
  draft,
  onChange,
}: {
  planName: string;
  featureName: string;
  draft: FeatureDraft;
  onChange: (patch: Partial<FeatureDraft>) => void;
}) {
  return (
    <td className="px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          aria-label={`${featureName} on ${planName}`}
          checked={draft.enabled}
          onChange={e => onChange({ enabled: e.target.checked })}
          className="rounded border-slate-300 text-brand-600"
        />
        {draft.enabled ? 'Included' : 'Not included'}
      </label>
      <div className={`mt-2 flex items-center gap-1.5 ${draft.enabled ? '' : 'opacity-40'}`}>
        <input
          aria-label={`${featureName} limit on ${planName}`}
          className={`${input} w-20`}
          inputMode="numeric"
          placeholder="∞"
          value={draft.limit}
          onChange={e => onChange({ limit: e.target.value })}
        />
        <span className="text-xs text-slate-400">per</span>
        <select
          aria-label={`${featureName} period on ${planName}`}
          className={`${input} w-24`}
          value={draft.period}
          onChange={e => onChange({ period: e.target.value as QuotaPeriod })}
        >
          {QUOTA_PERIODS.map(period => (
            <option key={period} value={period}>
              {period}
            </option>
          ))}
        </select>
      </div>
    </td>
  );
}
