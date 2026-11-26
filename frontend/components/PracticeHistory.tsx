import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, isAbortError } from '../services/http';
import { fetchPracticeAttempts, fetchPracticeProgress } from '../services/practiceHistoryClient';
import { PracticeKind } from '../types/practice';
import { ModeSummary, PracticeAttemptPage, PracticeProgress } from '../types/practiceHistory';
import { attemptPath, MODE_LABELS } from '../utils/practiceLinks';
import { attemptDetail, attemptOutcome } from '../utils/recentAttempts';
import { PracticeCoach } from './PracticeCoach';

/**
 * Practice history, at /dashboard/history: each mode over the last 30 days,
 * the coach, and every scored attempt in the quiz, code review and system
 * design, newest first, each linking to its own page
 * (PracticeAttemptPage). All of it is worked out on the server from stored
 * attempts. Problems' tutor attempts stay in Recent attempts on its screen.
 */

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';

const KINDS: PracticeKind[] = ['quiz', 'code_review', 'system_design'];

const UNITS: Record<PracticeKind, [string, string]> = {
  quiz: ['answer', 'answers'],
  code_review: ['review', 'reviews'],
  system_design: ['design', 'designs'],
};

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
    active
      ? 'bg-brand-600 border-brand-600 text-white'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400'
  }`;

export function PracticeHistory() {
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [kind, setKind] = useState<PracticeKind | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PracticeAttemptPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPracticeProgress(controller.signal)
      .then(setProgress)
      .catch(cause => {
        if (!isAbortError(cause)) setProgressError(errorMessage(cause, 'Could not load your practice progress.'));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPracticeAttempts({ kind, page: pageNumber }, controller.signal)
      .then(loaded => {
        setPage(loaded);
        setLoading(false);
      })
      .catch(cause => {
        if (isAbortError(cause)) return;
        setError(errorMessage(cause, 'Could not load your practice history.'));
        setLoading(false);
      });
    return () => controller.abort();
  }, [kind, pageNumber]);

  const pick = (next: PracticeKind | null) => {
    setKind(next);
    setPageNumber(1);
  };

  return (
    <div className="space-y-6">
      <section className={`${card} p-6`}>
        <h3 className="text-xl font-bold flex items-center">
          <span className="mr-2">📈</span> Practice history
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
          Every scored quiz answer, code review and system design, newest first. Open one to see it as it was scored.
          Problems keeps its own list under Recent attempts.
        </p>
        {progress && <ModeTotals progress={progress} />}
      </section>

      <PracticeCoach progress={progress} loading={!progress && !progressError} error={progressError} />

      <section className="space-y-3">
        <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={kind === null} onClick={() => pick(null)} className={pill(kind === null)}>
            Every mode
          </button>
          {KINDS.map(k => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)} className={pill(kind === k)}>
              {MODE_LABELS[k]}
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : loading && !page ? (
          <p className="text-sm text-slate-400 italic animate-pulse">Loading your history…</p>
        ) : !page || page.attempts.length === 0 ? (
          <p className={`${card} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            No scored attempts yet{kind ? ` in ${MODE_LABELS[kind]}` : ''}. They appear here as you practise.
          </p>
        ) : (
          <>
            <ul aria-label="Attempts" className={`${card} divide-y divide-slate-100 dark:divide-slate-800 ${loading ? 'opacity-60' : ''}`}>
              {page.attempts.map(attempt => {
                const outcome = attemptOutcome(attempt);
                return (
                  <li key={attempt.id}>
                    <Link
                      to={attemptPath(attempt.id)}
                      className="flex items-start justify-between gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-800 dark:text-slate-100 truncate">{attempt.title}</span>
                        <span className="block text-[11px] uppercase tracking-wide text-slate-400">
                          {new Date(attempt.createdAt).toLocaleDateString()} · {attemptDetail(attempt)}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-bold ${outcome.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {outcome.text}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {page.meta.lastPage > 1 && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  disabled={pageNumber <= 1 || loading}
                  onClick={() => setPageNumber(n => n - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  Newer
                </button>
                <span className="text-xs text-slate-400">
                  Page {page.meta.page} of {page.meta.lastPage}
                </span>
                <button
                  type="button"
                  disabled={pageNumber >= page.meta.lastPage || loading}
                  onClick={() => setPageNumber(n => n + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  Older
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ModeTotals({ progress }: { progress: PracticeProgress }) {
  const modes: ModeSummary[] = [progress.quiz, progress.codeReview, progress.systemDesign];

  return (
    <ul aria-label={`Last ${progress.windowDays} days`} className="mt-5 grid gap-3 sm:grid-cols-3">
      {modes.map(mode => {
        const [one, many] = UNITS[mode.kind];
        return (
          <li key={mode.kind} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{MODE_LABELS[mode.kind]}</p>
            {mode.attempts === 0 ? (
              <p className="mt-1 text-sm text-slate-400 italic">None yet in {progress.windowDays} days</p>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{mode.averageScore}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  average over {mode.attempts} {mode.attempts === 1 ? one : many}
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
