/**
 * Filtering and sorting for the job applications table.
 *
 * Kept out of the component so the rules are testable without a DOM: the table
 * renders whatever {@link visibleApplications} returns and owns no ordering
 * logic of its own.
 */

import { JobApplication, JobStatus } from '../types';

export type SortKey = 'company' | 'status' | 'statusUpdated' | 'nextAction' | 'dateApplied';

export type SortDirection = 'asc' | 'desc';

export interface ApplicationSort {
  key: SortKey;
  direction: SortDirection;
}

export interface ApplicationFilters {
  /** Matched against company, role, location and next action. */
  search: string;
  /** 'all' rather than null so the <select> has a real value. */
  status: JobStatus | 'all';
  /** Show only starred applications. */
  importantOnly: boolean;
}

export const DEFAULT_FILTERS: ApplicationFilters = {
  search: '',
  status: 'all',
  importantOnly: false,
};

/** Newest applications first, which is how the API already returns them. */
export const DEFAULT_SORT: ApplicationSort = { key: 'dateApplied', direction: 'desc' };

/**
 * The direction a column starts in when you first click it. Dates read most
 * usefully newest-first; names and pipeline stages read best forwards.
 */
const INITIAL_DIRECTION: Record<SortKey, SortDirection> = {
  company: 'asc',
  status: 'asc',
  statusUpdated: 'desc',
  nextAction: 'asc',
  dateApplied: 'desc',
};

/**
 * Pipeline order, not alphabetical: Saved → Applied → … → Rejected.
 *
 * Exported because the spreadsheet importer needs the same order to decide
 * whether a sheet's status advances an existing application or regresses it.
 * One definition, so sorting and importing cannot disagree.
 */
export const STATUS_ORDER: JobStatus[] = Object.values(JobStatus);

/** Applications per page in the tracker table. */
export const APPLICATIONS_PAGE_SIZE = 5;

/**
 * A colour per status, for the pill and the status select. Full class strings
 * so Tailwind's scanner sees every one.
 */
export const STATUS_STYLES: Record<JobStatus, string> = {
  [JobStatus.SAVED]: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600',
  [JobStatus.APPLIED]: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  [JobStatus.INTERVIEWING]: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  [JobStatus.OFFER]: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  [JobStatus.REJECTED]: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
};

/**
 * When the status last changed, as 'YYYY-MM-DD': the newest status event, or
 * '' when the API sent no history.
 */
export function statusUpdatedAt(app: JobApplication): string {
  const dates = (app.statusHistory ?? []).map(entry => entry.date ?? '').filter(Boolean);
  if (dates.length === 0) return '';

  return dates.reduce((latest, date) => (date > latest ? date : latest)).slice(0, 10);
}

export interface Page<T> {
  items: T[];
  /** The page actually shown, clamped into range. */
  page: number;
  pageCount: number;
}

/** One page of a list. A page past the end (after filtering) shows the last. */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;

  return { items: items.slice(start, start + pageSize), page: current, pageCount };
}

export function hasActiveFilters(filters: ApplicationFilters): boolean {
  return (
    filters.search.trim() !== '' || filters.status !== 'all' || filters.importantOnly
  );
}

/**
 * What clicking a column header should do: flip the direction when it is
 * already the sort column, otherwise switch to it in its natural direction.
 */
export function nextSort(current: ApplicationSort, key: SortKey): ApplicationSort {
  if (current.key !== key) return { key, direction: INITIAL_DIRECTION[key] };

  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function matchesSearch(app: JobApplication, term: string): boolean {
  const haystack = [app.company, app.role, app.location ?? '', app.nextAction ?? '']
    .join(' ')
    .toLowerCase();

  return haystack.includes(term);
}

export function filterApplications(
  applications: JobApplication[],
  filters: ApplicationFilters,
): JobApplication[] {
  const term = filters.search.trim().toLowerCase();

  return applications.filter(app => {
    if (filters.importantOnly && !app.isImportant) return false;
    if (filters.status !== 'all' && app.status !== filters.status) return false;
    if (term && !matchesSearch(app, term)) return false;

    return true;
  });
}

/**
 * Compare two cells, keeping blanks at the bottom whichever way the column is
 * sorted — a record with no date is missing one, not the earliest one.
 */
function compareBlankLast(
  a: string,
  b: string,
  sign: number,
  compare: (x: string, y: string) => number,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  return sign * compare(a, b);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareBy(a: JobApplication, b: JobApplication, sort: ApplicationSort): number {
  const sign = sort.direction === 'asc' ? 1 : -1;

  switch (sort.key) {
    case 'company':
      return (
        sign * compareText(a.company, b.company) ||
        sign * compareText(a.role, b.role)
      );

    case 'status':
      return sign * (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

    case 'statusUpdated':
      return compareBlankLast(statusUpdatedAt(a), statusUpdatedAt(b), sign, compareText);

    case 'nextAction':
      // The column shows the action and its due date, so due date leads and
      // the text only breaks ties.
      return (
        compareBlankLast(a.nextActionDue ?? '', b.nextActionDue ?? '', sign, compareText) ||
        compareBlankLast(a.nextAction ?? '', b.nextAction ?? '', sign, compareText)
      );

    case 'dateApplied':
      // 'YYYY-MM-DD' sorts correctly as a string; no Date objects needed.
      return compareBlankLast(a.dateApplied ?? '', b.dateApplied ?? '', sign, compareText);
  }
}

/**
 * Sort a copy of the list. Starred applications are pinned above the rest
 * whatever the sort column is — that is the whole point of starring one — and
 * the chosen column orders each group. Ties fall back to newest id first so
 * the order never wobbles between renders.
 */
export function sortApplications(
  applications: JobApplication[],
  sort: ApplicationSort,
): JobApplication[] {
  return [...applications].sort((a, b) => {
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;

    return compareBy(a, b, sort) || b.id - a.id;
  });
}

export function visibleApplications(
  applications: JobApplication[],
  filters: ApplicationFilters,
  sort: ApplicationSort,
): JobApplication[] {
  return sortApplications(filterApplications(applications, filters), sort);
}
