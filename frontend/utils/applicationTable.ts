/**
 * Filtering and sorting for the job applications table.
 *
 * Kept out of the component so the rules are testable without a DOM: the table
 * renders whatever {@link visibleApplications} returns and owns no ordering
 * logic of its own.
 */

import { JobApplication, JobStatus } from '../types';

export type SortKey = 'company' | 'status' | 'nextAction' | 'dateApplied';

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
  nextAction: 'asc',
  dateApplied: 'desc',
};

/** Pipeline order, not alphabetical: Saved → Applied → … → Rejected. */
const STATUS_ORDER: JobStatus[] = Object.values(JobStatus);

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
