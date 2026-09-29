import React, { useState } from 'react';
import { AtsReport, AtsSource, JobApplication } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, errorMessage } from '../services/http';
import { PremiumGate } from './PremiumGate';

/**
 * The ATS score check: how an applicant tracking system's keyword screen
 * would read this application's CV against its job description.
 *
 * The server does the scoring (backend/app/Services/Ats/AtsScorer.php). The
 * model only lists the job's keywords, once per job, so a re-check after
 * editing the CV is instant and free. Nothing here recomputes the number.
 */

export interface AtsBand {
  label: 'Strong' | 'Fair' | 'Weak';
  /** Border, background and text for the score tile and the badge. */
  style: string;
}

export function atsBand(score: number): AtsBand {
  if (score >= 75) {
    return {
      label: 'Strong',
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    };
  }
  if (score >= 50) {
    return {
      label: 'Fair',
      style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    };
  }
  return {
    label: 'Weak',
    style: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  };
}

const STALE_STYLE =
  'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600';

const SOURCE_LABELS: Record<AtsSource, string> = {
  tailored: 'Tailored CV',
  base: 'Base CV',
};

/** The tracker table's pill. Renders nothing for an unchecked application. */
export const AtsBadge = ({ report }: { report?: AtsReport | null }) => {
  if (!report) return null;

  const band = atsBand(report.score);
  const title = report.stale
    ? `ATS score ${report.score}/100 — the CV or job has changed since this check`
    : `ATS score ${report.score}/100 (${band.label})`;

  return (
    <span
      title={title}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${
        report.stale ? STALE_STYLE : band.style
      }`}
    >
      ATS {report.score}
    </span>
  );
};

interface AtsScorePanelProps {
  app: JobApplication;
  /** Whether the profile has a base CV to fall back on. */
  hasBaseCv: boolean;
  /** Run the check; resolves once the report is on the application. */
  onCheck: (source: AtsSource) => Promise<unknown>;
}

/** The drawer section. Keyed by application id by its parent. */
export const AtsScorePanel = ({ app, hasBaseCv, onCheck }: AtsScorePanelProps) => {
  const { isPremium, refreshUser } = useAuth();
  const report = app.atsReport ?? null;

  const available: Record<AtsSource, boolean> = {
    tailored: app.tailoredCV.trim() !== '',
    base: hasBaseCv,
  };
  const fallback: AtsSource = available.tailored ? 'tailored' : 'base';

  const [picked, setPicked] = useState<AtsSource>(report?.source ?? fallback);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatched, setShowMatched] = useState(false);

  // A CV that has since been cleared cannot stay selected.
  const source = available[picked] ? picked : fallback;
  const hasJob = app.jobDescription.trim() !== '';
  const hasCv = available[source];

  if (!isPremium) {
    return (
      <section>
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">ATS Score</h4>
        <PremiumGate title="ATS score (Premium)" />
      </section>
    );
  }

  const describe = (cause: unknown): string => {
    if (cause instanceof ApiError) {
      if (cause.isPremiumRequired) {
        // Our copy of the plan is stale; re-read it so the gate takes over.
        void refreshUser();
        return 'The ATS score is a Premium feature and this account is not on Premium. Ask an admin to upgrade the plan.';
      }
      if (cause.isAiUnavailable) {
        return 'The AI service is not answering right now. Nothing was lost — try again in a moment.';
      }
    }
    return errorMessage(cause, 'Could not check the ATS score.');
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      await onCheck(source);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setChecking(false);
    }
  };

  const band = report ? atsBand(report.score) : null;
  const passedChecks = report ? report.checks.filter(c => c.passed).length : 0;

  return (
    <section aria-labelledby={`ats-heading-${app.id}`}>
      <div className="flex justify-between items-center mb-2 gap-2">
        <h4 id={`ats-heading-${app.id}`} className="text-xs font-bold uppercase tracking-widest text-slate-400">
          ATS Score
        </h4>
        {report && (
          <span className="text-[10px] text-slate-400">
            {new Date(report.checkedAt).toLocaleDateString()} · {SOURCE_LABELS[report.source]}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 space-y-4">
        {report && band ? (
          <div className="flex items-center gap-4">
            <div
              aria-label={`ATS score ${report.score} out of 100`}
              className={`w-16 h-16 shrink-0 rounded-2xl border flex flex-col items-center justify-center ${
                report.stale ? STALE_STYLE : band.style
              }`}
            >
              <span className="text-2xl font-black leading-none">{report.score}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest mt-1">{band.label}</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-0.5">
              <p>
                <strong>{report.keywords.matched} of {report.keywords.total}</strong> keywords ·{' '}
                <strong>{passedChecks} of {report.checks.length}</strong> format checks
              </p>
              <p className="text-xs text-slate-400">Keywords make up 80 points, format 20.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            See how an applicant tracking system's keyword screen would read your CV for this job, and
            which of its keywords you are missing.
          </p>
        )}

        {report?.stale && (
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Your CV or the job description changed since this check. Re-check to update the score.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="CV to check"
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            {(Object.keys(SOURCE_LABELS) as AtsSource[]).map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={source === option}
                disabled={!available[option] || checking}
                onClick={() => setPicked(option)}
                className={`px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
                  source === option
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {SOURCE_LABELS[option]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={check}
            disabled={checking || !hasJob || !hasCv}
            className="ml-auto px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
          >
            {checking ? 'Checking...' : report ? 'Re-check' : 'Check score'}
          </button>
        </div>

        {!hasJob ? (
          <p className="text-xs text-amber-600 font-bold">This application has no job description to score against.</p>
        ) : !hasCv ? (
          <p className="text-xs text-amber-600 font-bold">
            Generate a tailored CV, or add your base CV in CV &amp; Profile first.
          </p>
        ) : null}

        {error && (
          <p role="alert" className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-3">
            {error}
          </p>
        )}

        {report && report.missing.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Missing ({report.missing.length})
            </p>
            <ul aria-label="Missing keywords" className="flex flex-wrap gap-1.5">
              {report.missing.map(keyword => (
                <li
                  key={keyword.term}
                  className="rounded-full border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs"
                >
                  {keyword.term}
                  {keyword.required && (
                    <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-rose-500">required</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Work in the ones that are true of you, in the words the posting uses.
            </p>
          </div>
        )}

        {report && report.matched.length > 0 && (
          <div>
            <button
              type="button"
              aria-expanded={showMatched}
              onClick={() => setShowMatched(open => !open)}
              className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              Matched ({report.matched.length}) {showMatched ? '▾' : '▸'}
            </button>
            {showMatched && (
              <ul aria-label="Matched keywords" className="flex flex-wrap gap-1.5 mt-1.5">
                {report.matched.map(keyword => (
                  <li
                    key={keyword.term}
                    className="rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs"
                  >
                    {keyword.term}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {report && (
          <ul aria-label="Format checks" className="space-y-1.5">
            {report.checks.map(item => (
              <li key={item.id} className="flex gap-2 text-xs">
                <span aria-hidden="true" className={item.passed ? 'text-emerald-600' : 'text-rose-500'}>
                  {item.passed ? '✓' : '✗'}
                </span>
                <span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                  <span className="sr-only"> {item.passed ? 'passed' : 'failed'}</span>
                  <span className="text-slate-500 dark:text-slate-400"> — {item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
