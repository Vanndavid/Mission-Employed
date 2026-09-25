import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { JobApplication } from '../types';
import {
  INSIGHTS_RANGES,
  InsightsRange,
  monthLabel,
  ReasonCategory,
  rejectionInsights,
} from '../utils/rejectionInsights';

/** 'YYYY-MM-DD' as a local date, or a dash. */
const formatDay = (day: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString() : '—');

const StatTile = ({ label, value, detail }: { label: string; value: number; detail?: string }) => (
  <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50 tabular-nums">
      {value}
      {detail && <span className="ml-2 text-sm font-bold text-slate-500">{detail}</span>}
    </p>
  </div>
);

const cardClass = 'bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700 p-6';

/**
 * The Insights tab: which of Seek's screening questions keep screening you
 * out, and how rejections are trending. Every figure is worked out by
 * {@link rejectionInsights}; this only draws it.
 *
 * The bars are plain divs rather than a chart library — two simple bar charts
 * do not justify a dependency.
 */
export const RejectionInsights = ({ applications }: { applications: JobApplication[] }) => {
  const [range, setRange] = useState<InsightsRange>('all');
  const [selected, setSelected] = useState<ReasonCategory | null>(null);

  const insights = useMemo(() => rejectionInsights(applications, range), [applications, range]);
  const anyFeedbackEver = useMemo(
    () => applications.some(app => (app.rejectionReasons ?? []).some(r => r.trim())),
    [applications],
  );

  const selectedBar = insights.categories.find(c => c.category === selected) ?? null;
  const maxCount = Math.max(1, ...insights.categories.map(c => c.count));
  const maxMonth = Math.max(1, ...insights.months.map(m => m.withFeedback + m.withoutFeedback));

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
        {INSIGHTS_RANGES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={range === key}
            onClick={() => setRange(key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
              range === key
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Applications" value={insights.totalApplications} />
        <StatTile label="Rejected" value={insights.totalRejected} />
        <StatTile
          label="Rejected with SEEK feedback"
          value={insights.rejectedWithFeedback}
          detail={insights.totalRejected > 0 ? `${insights.rejectedWithFeedbackPercent}% of rejected` : undefined}
        />
      </div>

      {!anyFeedbackEver ? (
        <p className={`${cardClass} text-sm text-slate-500`}>
          No rejection feedback yet. When a SEEK “unlikely to progress” email lists screening questions,
          they are saved on the application and charted here.
        </p>
      ) : (
        <>
          <section aria-labelledby="screened-out-heading" className={cardClass}>
            <h3 id="screened-out-heading" className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Why SEEK screened me out
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Applications with feedback in each category, and their share of the {insights.withFeedback} that have
              any. Select a bar to see them.
            </p>

            {insights.categories.length === 0 ? (
              <p className="text-sm text-slate-500">No rejection feedback in this date range.</p>
            ) : (
              <ul className="space-y-1">
                {insights.categories.map(bar => {
                  const active = selected === bar.category;
                  return (
                    <li key={bar.category}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(active ? null : bar.category)}
                        title={`${bar.category}: ${bar.count} ${bar.count === 1 ? 'application' : 'applications'}, ${bar.percent}%`}
                        className={`w-full grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                          active ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                          {bar.category}
                        </span>
                        <span className="h-4 rounded-r bg-slate-100 dark:bg-slate-800">
                          <span
                            className={`block h-full rounded-r ${active ? 'bg-brand-600' : 'bg-brand-500'}`}
                            style={{ width: `${(bar.count / maxCount) * 100}%` }}
                          />
                        </span>
                        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <span className="font-bold">{bar.count}</span>
                          <span className="text-slate-400"> · {bar.percent}%</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedBar && (
              <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                  {selectedBar.category} · {selectedBar.matches.length}{' '}
                  {selectedBar.matches.length === 1 ? 'reason' : 'reasons'}
                </h4>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedBar.matches.map(({ app, reason, date }, i) => (
                    <li key={`${app.id}-${i}`}>
                      <Link
                        to={`/applications?prep=${app.id}`}
                        className="block py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{app.company}</span>
                          <span className="text-sm text-slate-500">{app.role}</span>
                          <span className="ml-auto text-xs text-slate-400">{formatDay(date)}</span>
                        </span>
                        <span className="block text-sm text-slate-600 dark:text-slate-300 mt-1">{reason}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {insights.months.length > 0 && (
            <section aria-labelledby="rejections-over-time-heading" className={cardClass}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h3 id="rejections-over-time-heading" className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Rejections over time
                </h3>
                <div className="flex gap-4 text-xs text-slate-500" aria-hidden="true">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> With feedback
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /> Without feedback
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-2 h-32 border-b border-slate-200 dark:border-slate-700" aria-hidden="true">
                {insights.months.map(m => {
                  const total = m.withFeedback + m.withoutFeedback;
                  return (
                    <div
                      key={m.month}
                      title={`${monthLabel(m.month)}: ${m.withFeedback} with feedback, ${m.withoutFeedback} without`}
                      className="flex-1 min-w-0 max-w-12 h-full flex flex-col justify-end items-center"
                    >
                      {total > 0 && <span className="text-[10px] font-bold text-slate-500 tabular-nums mb-1">{total}</span>}
                      <div
                        className="w-full flex flex-col gap-0.5"
                        style={{ height: `calc((100% - 1.25rem) * ${total / maxMonth})` }}
                      >
                        {m.withoutFeedback > 0 && (
                          <div className="w-full rounded-t bg-slate-300 dark:bg-slate-600" style={{ flexGrow: m.withoutFeedback }} />
                        )}
                        {m.withFeedback > 0 && (
                          <div
                            className={`w-full bg-brand-600 ${m.withoutFeedback > 0 ? '' : 'rounded-t'}`}
                            style={{ flexGrow: m.withFeedback }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-1" aria-hidden="true">
                {insights.months.map(m => (
                  <span key={m.month} className="flex-1 min-w-0 max-w-12 text-center text-[10px] text-slate-400 truncate">
                    {monthLabel(m.month)}
                  </span>
                ))}
              </div>

              <table className="sr-only">
                <caption>Rejected applications per month</caption>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>With feedback</th>
                    <th>Without feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.months.map(m => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td>{m.withFeedback}</td>
                      <td>{m.withoutFeedback}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
};
