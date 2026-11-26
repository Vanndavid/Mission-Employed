import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { NavTabKey } from '../types/auth';
import { PracticeProgress } from '../types/practiceHistory';
import { CoachMode, coachAreas, CoachPick, coachPicks, WeighedArea } from '../utils/practiceCoach';
import { HISTORY_PATH, MODE_LABELS, MODE_PATHS, mistakesPath, startPath } from '../utils/practiceLinks';

/**
 * The coach on Mission Control: the three areas across the practice modes
 * that cost the most points at the user's recent average, each with a
 * one-click start (utils/practiceCoach.ts ranks them; no AI is involved).
 * Only modes the account can open are suggested: a mode an admin has hidden
 * or the plan does not include is left out.
 */

/** Each mode's tab, which an admin can hide. */
const MODE_TABS: Record<CoachMode, NavTabKey> = {
  quiz: 'practice_quiz',
  code_review: 'practice_code_review',
  system_design: 'practice_system_design',
};

const UNITS: Record<CoachMode, [string, string]> = {
  quiz: ['answer', 'answers'],
  code_review: ['review', 'reviews'],
  system_design: ['design', 'designs'],
};

const START_LABELS: Record<CoachMode, string> = {
  quiz: 'Start a round',
  code_review: 'Start a review',
  system_design: 'Start a design',
};

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm';
const primary = 'px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold';
const secondary =
  'px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-brand-400';

export function PracticeCoach({
  progress,
  loading = false,
  error = null,
}: {
  progress: PracticeProgress | null;
  loading?: boolean;
  error?: string | null;
}) {
  const { isAdmin, hiddenTabs } = useAuth();
  const { canUse } = useSubscription();

  const picks = useMemo(() => {
    if (!progress) return [];
    const visible = (mode: CoachMode) => isAdmin || !hiddenTabs.includes(MODE_TABS[mode]);
    const available = (['quiz', 'code_review', 'system_design'] as CoachMode[]).filter(
      mode => visible(mode) && (mode === 'quiz' || canUse(mode)),
    );
    return coachPicks(coachAreas(progress), available);
  }, [progress, isAdmin, hiddenTabs, canUse]);

  return (
    <section className={card} aria-labelledby="practice-coach-title">
      <div className="flex justify-between items-center mb-3 gap-3">
        <h3 id="practice-coach-title" className="text-lg font-bold flex items-center">
          <span className="mr-2">🎯</span> Practise next
        </h3>
        <Link to={HISTORY_PATH} className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400 hover:underline">
          Practice history
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400 font-bold">{error}</p>
      ) : loading && !progress ? (
        <p className="text-sm text-slate-400 italic animate-pulse">Working out what to practise…</p>
      ) : picks.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          Nothing to suggest yet. Answer a few quiz questions, review a snippet or score a design, and this will say what
          to work on next.
        </p>
      ) : (
        <>
          <ol aria-label="What to practise next" className="space-y-4">
            {picks.map(pick => (
              <li key={pick.type === 'weak' ? pick.area.key : `untried-${pick.mode}`}>
                <Pick pick={pick} />
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
            Ranked by the points each area costs you on a 100-point attempt at your recent average, newer attempts
            counting more.
          </p>
        </>
      )}
    </section>
  );
}

function Pick({ pick }: { pick: CoachPick }) {
  if (pick.type === 'untried') {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 dark:text-slate-100">{MODE_LABELS[pick.mode]}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Not tried yet.</p>
        </div>
        <Link to={MODE_PATHS[pick.mode]} className={`${secondary} shrink-0`}>
          Try it
        </Link>
      </div>
    );
  }

  const { area } = pick;
  const mistakes = area.mode === 'quiz' && area.mistakes && area.mistakes.count > 0 ? area.mistakes : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{MODE_LABELS[area.mode]}</p>
          <p className="font-bold text-slate-800 dark:text-slate-100">{title(area)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{summary(area)}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400" title="Points lost on a 100-point attempt">
          −{Math.round(area.pointsLost)} pts
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={startPath(area.start)} className={primary}>
          {START_LABELS[area.mode]}
        </Link>
        {mistakes && (
          <Link to={mistakesPath(mistakes.language)} className={secondary}>
            Retry {mistakes.count} {mistakes.count === 1 ? 'mistake' : 'mistakes'}
          </Link>
        )}
      </div>
    </div>
  );
}

function title(area: WeighedArea): string {
  return area.mode === 'code_review' ? `${area.label} issues` : area.label;
}

function summary(area: WeighedArea): string {
  const [one, many] = UNITS[area.mode];
  return `${area.average}% on your last ${area.considered} ${area.considered === 1 ? one : many}`;
}
