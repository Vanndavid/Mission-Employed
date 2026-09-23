import React, { FormEvent, useEffect, useState } from 'react';
import { searchSeekJobs } from '../services/seekClient';
import { errorMessage, isAbortError } from '../services/http';
import { useToast } from './ToastProvider';
import {
  DEFAULT_SEEK_KEYWORDS,
  DEFAULT_SEEK_WHERE,
  SeekJob,
  SeekSearchResult,
  isSeekJobTracked,
  seekJobToApplication,
} from '../utils/seekJobs';
import { ApplicationInput } from '../types';

/** Page sizes offered in the picker. The API caps a page at 50. */
export const SEEK_PAGE_SIZES = [6, 12, 20, 50] as const;
export const DEFAULT_SEEK_PAGE_SIZE = 6;

interface SeekJobsProps {
  /** Application URLs already in the tracker, used to mark listings as saved. */
  trackedUrls: string[];
  onSave: (input: ApplicationInput) => void | Promise<unknown>;
}

/**
 * Live Seek listings for the job applications page.
 *
 * Loads a default software-engineer / All Australia search on mount, then
 * lets the user refine keywords and location. Saving writes through
 * {@link onSave} as a Saved application — the same create path as the
 * manual form on the tracker tab.
 */
export const SeekJobs = ({ trackedUrls, onSave }: SeekJobsProps) => {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState(DEFAULT_SEEK_KEYWORDS);
  const [where, setWhere] = useState(DEFAULT_SEEK_WHERE);
  const [query, setQuery] = useState({
    keywords: DEFAULT_SEEK_KEYWORDS,
    where: DEFAULT_SEEK_WHERE,
    page: 1,
    pageSize: DEFAULT_SEEK_PAGE_SIZE,
  });
  const [result, setResult] = useState<SeekSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    void searchSeekJobs(query, controller.signal)
      .then(next => {
        if (controller.signal.aborted) return;
        setResult(next);
        setError(null);
      })
      .catch(cause => {
        if (isAbortError(cause) || controller.signal.aborted) return;
        setResult(null);
        setError(errorMessage(cause, 'Could not load Seek jobs.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(current => ({
      ...current,
      keywords: keywords.trim() || DEFAULT_SEEK_KEYWORDS,
      where: where.trim() || DEFAULT_SEEK_WHERE,
      page: 1,
    }));
  };

  const page = query.page;
  const pageSize = result?.pageSize ?? query.pageSize;
  const totalCount = result?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const jobs = result?.jobs ?? [];

  const handleSave = async (job: SeekJob) => {
    if (savingId) return;
    setSavingId(job.id);
    try {
      await Promise.resolve(onSave(seekJobToApplication(job)));
      toast(`Saved ${job.title} at ${job.company}`, 'success');
    } catch (cause) {
      toast(errorMessage(cause, 'Could not save that job.'), 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border border-dashed border-slate-200 dark:border-slate-700 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400">Seek jobs</h3>
        <p className="text-xs text-slate-400 mt-1">
          Live listings from Seek. Save one to add it to the tracker as Saved.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          placeholder="Keywords, e.g. software engineer"
          aria-label="Seek keywords"
          className="flex-1 min-w-[12rem] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
        />
        <input
          value={where}
          onChange={e => setWhere(e.target.value)}
          placeholder="Location, e.g. All Australia"
          aria-label="Seek location"
          className="flex-1 min-w-[10rem] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search Seek'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-rose-500" role="alert">
          {error}
        </p>
      )}

      {!error && !loading && jobs.length === 0 && (
        <p className="text-sm text-slate-400 italic">No Seek listings matched that search.</p>
      )}

      {jobs.length > 0 && (
        <ul className="space-y-3">
          {jobs.map(job => {
            const saved = isSeekJobTracked(job, trackedUrls);
            const saving = savingId === job.id;
            const meta = [
              job.location,
              job.salary,
              [...job.workTypes, job.workArrangement].filter(Boolean).join(' · '),
              job.listedAgo,
            ].filter(Boolean);

            return (
              <li
                key={job.id}
                className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-200">{job.title}</p>
                    <p className="text-sm text-slate-500">{job.company}</p>
                    {meta.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">{meta.join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600"
                    >
                      View on Seek
                    </a>
                    <button
                      type="button"
                      disabled={saved || saving}
                      onClick={() => void handleSave(job)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold ${
                        saved
                          ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-default'
                          : 'bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50'
                      }`}
                    >
                      {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                {job.teaser && (
                  <p className="text-sm text-slate-500 mt-3">{job.teaser}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-400" aria-live="polite">
              Showing {from}–{to} of {totalCount}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Per page
              <select
                value={query.pageSize}
                onChange={e =>
                  setQuery(current => ({ ...current, pageSize: Number(e.target.value), page: 1 }))
                }
                aria-label="Listings per page"
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                {SEEK_PAGE_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              Page {page} of {lastPage}
            </span>
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setQuery(current => ({ ...current, page: current.page - 1 }))}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || page >= lastPage}
              onClick={() => setQuery(current => ({ ...current, page: current.page + 1 }))}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
