import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HUNT_PERSONAS } from '../constants';
import { TalentMeResponse, TalentMetrics, TALENT_PILLAR_MAX, TALENT_TIER_META } from '../types/talent';
import { computeTalentScore } from '../utils/talentScore';
import { fetchTalentMe, setTalentVisibility } from '../services/authClient';
import { TalentSyncStatus } from '../hooks/useTalentSync';
import { useToast } from './ToastProvider';

interface TalentRankPageProps {
  metrics: TalentMetrics;
  syncStatus: TalentSyncStatus;
}

export function TalentRankPage({ metrics, syncStatus }: TalentRankPageProps) {
  const { toast } = useToast();
  const [me, setMe] = useState<TalentMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const preview = computeTalentScore(metrics);
  const score = me?.snapshot?.score ?? preview;
  const tier = TALENT_TIER_META[score.tier];
  const persona = HUNT_PERSONAS[metrics.huntPersona];

  const load = async () => {
    try {
      setMe(await fetchTalentMe());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load talent rank', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (syncStatus === 'ok') void load();
  }, [syncStatus]);

  const toggleVisibility = async (visibleToCompanies: boolean) => {
    setBusy(true);
    try {
      const res = await setTalentVisibility(visibleToCompanies);
      setMe(res);
      toast(
        visibleToCompanies
          ? 'You are listed for company placement'
          : 'Removed from the company roster',
        'success'
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update listing', 'error');
    } finally {
      setBusy(false);
    }
  };

  const visible = me?.snapshot?.visibleToCompanies ?? false;
  const syncLabel =
    syncStatus === 'syncing' ? 'Syncing hunt stats…'
      : syncStatus === 'ok' ? 'Synced'
        : syncStatus === 'error' ? 'Sync paused — server offline'
          : 'Waiting to sync';

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Talent Rank</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          How you stack up as an operator — the same signal we will use to place talent with companies.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Talent score</p>
              <p className="text-6xl font-black text-slate-900 dark:text-slate-50 mt-1 tabular-nums">{score.total}</p>
              <p className="text-sm text-slate-500 mt-2">
                <span className="font-bold text-brand-600 dark:text-brand-400">{tier.label}</span>
                {' · '}
                {persona.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rank</p>
              <p className="text-3xl font-black tabular-nums">
                {me?.rank ? `#${me.rank}` : '—'}
                <span className="text-base font-semibold text-slate-400">
                  {me?.totalRanked ? ` / ${me.totalRanked}` : ''}
                </span>
              </p>
              {me?.percentile != null && (
                <p className="text-xs text-slate-500 mt-1">{me.percentile}th percentile</p>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-4">{tier.blurb}</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-4">{syncLabel}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-900 text-white p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">Why this exists</p>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">
            Companies will buy access to ranked hunters — execution, interview conversion, and offers — not résumés in a pile.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            Only aggregates leave your browser. Job descriptions, CVs, and company names stay local.
          </p>
        </div>
      </div>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-4">Score breakdown</h3>
        <div className="space-y-4">
          <Pillar
            label="Execution"
            hint="Protocol, streak, volume, STAR bank, docs"
            value={score.execution}
            max={TALENT_PILLAR_MAX.execution}
          />
          <Pillar
            label="Technical"
            hint="Completed problems, medium/hard mix, topic breadth"
            value={score.technical}
            max={TALENT_PILLAR_MAX.technical}
          />
          <Pillar
            label="Interview"
            hint="Applied → interview and interview → offer, gated by sample size"
            value={score.interview}
            max={TALENT_PILLAR_MAX.interview}
          />
          <Pillar
            label="Outcome"
            hint="Live interviews and offers on the board"
            value={score.outcome}
            max={TALENT_PILLAR_MAX.outcome}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Submitted" value={`${metrics.submitted}`} />
        <Stat label="Interviewing" value={`${metrics.interviewing}`} />
        <Stat label="Offers" value={`${metrics.offers}`} />
        <Stat label="Applied → Interview" value={`${metrics.appliedToInterview}%`} />
        <Stat label="Interview → Offer" value={`${metrics.interviewToOffer}%`} />
        <Stat label="Coding completed" value={`${metrics.codingCompleted}`} />
        <Stat label="Protocol (28d)" value={`${metrics.protocolCompletionRate}%`} />
        <Stat label="Streak" value={`${metrics.streakDays}d`} />
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6">
        <h3 className="text-lg font-bold">List me for companies</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Opt in to the placement roster. Admins (and later, hiring companies) can see your score, persona, and email — not your pipeline notes.
        </p>
        <button
          type="button"
          disabled={busy || loading || !me?.snapshot}
          onClick={() => void toggleVisibility(!visible)}
          className={`mt-4 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-40 ${
            visible
              ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              : 'bg-brand-600 hover:bg-brand-500 text-white'
          }`}
        >
          {visible ? 'Remove from roster' : 'Available for placement'}
        </button>
        {visible && (
          <p className="text-xs text-brand-600 dark:text-brand-400 mt-3 font-semibold">
            On the company roster
          </p>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Raise this score by completing the protocol, logging interviews, and converting them.{' '}
        <NavLink to="/analytics" className="text-brand-600 dark:text-brand-400 font-semibold">
          Hunt Command Center
        </NavLink>
      </p>
    </div>
  );
}

function Pillar({
  label,
  hint,
  value,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        <span className="tabular-nums font-bold">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1 tabular-nums">{value}</p>
    </div>
  );
}
