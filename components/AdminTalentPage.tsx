import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AdminTalentRow, TALENT_TIER_META } from '../types/talent';
import { HUNT_PERSONAS } from '../constants';
import { HuntPersonaId } from '../types';
import { listAdminTalent } from '../services/authClient';
import { useToast } from './ToastProvider';

type FilterPersona = 'all' | HuntPersonaId;
type FilterRoster = 'all' | 'available';

export function AdminTalentPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [talents, setTalents] = useState<AdminTalentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<FilterPersona>('all');
  const [roster, setRoster] = useState<FilterRoster>('all');

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    listAdminTalent()
      .then(res => {
        if (!cancelled) setTalents(res.talents);
      })
      .catch(e => {
        if (!cancelled) toast(e instanceof Error ? e.message : 'Failed to load roster', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    return talents.filter(row => {
      if (roster === 'available' && !row.visibleToCompanies) return false;
      if (persona !== 'all' && row.metrics.huntPersona !== persona) return false;
      return true;
    });
  }, [talents, persona, roster]);

  if (!isAdmin) return <Navigate to="/account" replace />;

  const availableCount = talents.filter(t => t.visibleToCompanies).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Talent roster</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Ranked hunters for a future placement business. Scores are computed on the server from synced hunt aggregates — not client-supplied totals.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Ranked hunters" value={`${talents.length}`} />
        <MiniStat label="Available for companies" value={`${availableCount}`} />
        <MiniStat
          label="Placed (has offer)"
          value={`${talents.filter(t => t.score.placed).length}`}
        />
        <MiniStat
          label="Elite+"
          value={`${talents.filter(t => t.score.tier === 'elite' || t.score.tier === 'placed').length}`}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={roster}
          onChange={e => setRoster(e.target.value as FilterRoster)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="all">All synced hunters</option>
          <option value="available">Available for companies</option>
        </select>
        <select
          value={persona}
          onChange={e => setPersona(e.target.value as FilterPersona)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="all">All personas</option>
          {Object.entries(HUNT_PERSONAS).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading roster…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No hunters match these filters yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-[10px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold">Rank</th>
                <th className="px-4 py-3 font-bold">Hunter</th>
                <th className="px-4 py-3 font-bold">Score</th>
                <th className="px-4 py-3 font-bold">Tier</th>
                <th className="px-4 py-3 font-bold">Persona</th>
                <th className="px-4 py-3 font-bold">Offers</th>
                <th className="px-4 py-3 font-bold">A→I</th>
                <th className="px-4 py-3 font-bold">Coding</th>
                <th className="px-4 py-3 font-bold">Protocol</th>
                <th className="px-4 py-3 font-bold">Companies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filtered.map(row => (
                <tr key={row.user.id} className={row.stale ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-black tabular-nums">#{row.rank}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800 dark:text-slate-100 break-all">{row.user.email}</p>
                    {row.stale && (
                      <p className="text-[10px] uppercase tracking-widest text-amber-600 mt-1">Stale &gt;14d</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-black tabular-nums text-brand-600 dark:text-brand-400">
                    {row.score.total}
                  </td>
                  <td className="px-4 py-3 font-semibold">{TALENT_TIER_META[row.score.tier].label}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {HUNT_PERSONAS[row.metrics.huntPersona]?.label ?? row.metrics.huntPersona}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.metrics.offers}</td>
                  <td className="px-4 py-3 tabular-nums">{row.metrics.appliedToInterview}%</td>
                  <td className="px-4 py-3 tabular-nums">{row.metrics.codingCompleted}</td>
                  <td className="px-4 py-3 tabular-nums">{row.metrics.protocolCompletionRate}%</td>
                  <td className="px-4 py-3">
                    {row.visibleToCompanies ? (
                      <span className="text-brand-600 dark:text-brand-400 font-semibold">Listed</span>
                    ) : (
                      <span className="text-slate-400">Private</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1 tabular-nums">{value}</p>
    </div>
  );
}
