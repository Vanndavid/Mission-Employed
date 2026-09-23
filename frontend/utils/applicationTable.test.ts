import { describe, it, expect } from 'vitest';
import { JobApplication, JobStatus } from '../types';
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  filterApplications,
  hasActiveFilters,
  nextSort,
  paginate,
  sortApplications,
  STATUS_STYLES,
  statusUpdatedAt,
  visibleApplications,
} from './applicationTable';

let nextId = 1;

function app(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: nextId++,
    company: 'Acme Corp',
    role: 'Backend Engineer',
    location: 'Sydney',
    url: '',
    source: '',
    dateApplied: '2026-01-01',
    status: JobStatus.APPLIED,
    isImportant: false,
    notes: '',
    jobDescription: '',
    coverLetter: '',
    tailoredCV: '',
    interviewStages: [],
    nextAction: '',
    nextActionDue: '',
    recruiterContact: null,
    takeHome: null,
    offer: null,
    ...overrides,
  };
}

const companies = (list: JobApplication[]) => list.map(a => a.company);

describe('filterApplications', () => {
  const list = [
    app({ company: 'Acme Corp', role: 'Backend Engineer', status: JobStatus.APPLIED }),
    app({ company: 'Globex', role: 'Frontend Engineer', status: JobStatus.INTERVIEWING, isImportant: true }),
    app({ company: 'Initech', role: 'Platform Engineer', status: JobStatus.REJECTED, location: 'Melbourne' }),
  ];

  it('returns everything when no filter is set', () => {
    expect(filterApplications(list, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it('matches the search term against company, role and location', () => {
    expect(companies(filterApplications(list, { ...DEFAULT_FILTERS, search: 'globex' }))).toEqual(['Globex']);
    expect(companies(filterApplications(list, { ...DEFAULT_FILTERS, search: 'frontend' }))).toEqual(['Globex']);
    expect(companies(filterApplications(list, { ...DEFAULT_FILTERS, search: 'melbourne' }))).toEqual(['Initech']);
    expect(filterApplications(list, { ...DEFAULT_FILTERS, search: '   ' })).toHaveLength(3);
  });

  it('filters by status', () => {
    const filtered = filterApplications(list, { ...DEFAULT_FILTERS, status: JobStatus.REJECTED });

    expect(companies(filtered)).toEqual(['Initech']);
  });

  it('filters down to starred applications', () => {
    const filtered = filterApplications(list, { ...DEFAULT_FILTERS, importantOnly: true });

    expect(companies(filtered)).toEqual(['Globex']);
  });

  it('combines filters', () => {
    const filtered = filterApplications(list, {
      search: 'engineer',
      status: JobStatus.INTERVIEWING,
      importantOnly: true,
    });

    expect(companies(filtered)).toEqual(['Globex']);
  });
});

describe('hasActiveFilters', () => {
  it('ignores whitespace-only search terms', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'acme' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: JobStatus.OFFER })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, importantOnly: true })).toBe(true);
  });
});

describe('nextSort', () => {
  it('flips the direction of the column already being sorted', () => {
    expect(nextSort({ key: 'company', direction: 'asc' }, 'company')).toEqual({
      key: 'company',
      direction: 'desc',
    });
  });

  it('starts a new column in its natural direction', () => {
    expect(nextSort({ key: 'company', direction: 'desc' }, 'dateApplied')).toEqual({
      key: 'dateApplied',
      direction: 'desc',
    });
    expect(nextSort({ key: 'dateApplied', direction: 'desc' }, 'status')).toEqual({
      key: 'status',
      direction: 'asc',
    });
  });
});

describe('sortApplications', () => {
  it('sorts by company name in both directions', () => {
    const list = [app({ company: 'Initech' }), app({ company: 'Acme' }), app({ company: 'globex' })];

    expect(companies(sortApplications(list, { key: 'company', direction: 'asc' })))
      .toEqual(['Acme', 'globex', 'Initech']);
    expect(companies(sortApplications(list, { key: 'company', direction: 'desc' })))
      .toEqual(['Initech', 'globex', 'Acme']);
  });

  it('sorts status in pipeline order rather than alphabetically', () => {
    const list = [
      app({ company: 'Rejected Co', status: JobStatus.REJECTED }),
      app({ company: 'Saved Co', status: JobStatus.SAVED }),
      app({ company: 'Offer Co', status: JobStatus.OFFER }),
    ];

    expect(companies(sortApplications(list, { key: 'status', direction: 'asc' })))
      .toEqual(['Saved Co', 'Offer Co', 'Rejected Co']);
  });

  it('sorts by date applied, newest first by default', () => {
    const list = [
      app({ company: 'Older', dateApplied: '2026-01-01' }),
      app({ company: 'Newer', dateApplied: '2026-06-01' }),
    ];

    expect(companies(sortApplications(list, DEFAULT_SORT))).toEqual(['Newer', 'Older']);
  });

  it('keeps rows with no date at the bottom whichever way the column is sorted', () => {
    const list = [
      app({ company: 'Blank', dateApplied: '' }),
      app({ company: 'Older', dateApplied: '2026-01-01' }),
      app({ company: 'Newer', dateApplied: '2026-06-01' }),
    ];

    expect(companies(sortApplications(list, { key: 'dateApplied', direction: 'desc' })))
      .toEqual(['Newer', 'Older', 'Blank']);
    expect(companies(sortApplications(list, { key: 'dateApplied', direction: 'asc' })))
      .toEqual(['Older', 'Newer', 'Blank']);
  });

  it('sorts the next action column by its due date', () => {
    const list = [
      app({ company: 'Later', nextAction: 'Follow up', nextActionDue: '2026-03-01' }),
      app({ company: 'Sooner', nextAction: 'Send CV', nextActionDue: '2026-02-01' }),
      app({ company: 'Undated', nextAction: 'Wait' }),
    ];

    expect(companies(sortApplications(list, { key: 'nextAction', direction: 'asc' })))
      .toEqual(['Sooner', 'Later', 'Undated']);
  });

  it('pins starred applications above the rest whatever the sort column is', () => {
    const list = [
      app({ company: 'Zed', dateApplied: '2026-06-01' }),
      app({ company: 'Starred', dateApplied: '2020-01-01', isImportant: true }),
      app({ company: 'Alpha', dateApplied: '2026-05-01' }),
    ];

    expect(companies(sortApplications(list, DEFAULT_SORT))).toEqual(['Starred', 'Zed', 'Alpha']);
    expect(companies(sortApplications(list, { key: 'company', direction: 'asc' })))
      .toEqual(['Starred', 'Alpha', 'Zed']);
  });

  it('breaks ties on the newest id and leaves the input array alone', () => {
    const first = app({ company: 'Same', dateApplied: '2026-01-01' });
    const second = app({ company: 'Same', dateApplied: '2026-01-01' });
    const list = [first, second];

    expect(sortApplications(list, DEFAULT_SORT).map(a => a.id)).toEqual([second.id, first.id]);
    expect(list).toEqual([first, second]);
  });
});

describe('visibleApplications', () => {
  it('filters first, then sorts what is left', () => {
    const list = [
      app({ company: 'Acme', status: JobStatus.APPLIED, dateApplied: '2026-01-01' }),
      app({ company: 'Globex', status: JobStatus.APPLIED, dateApplied: '2026-05-01' }),
      app({ company: 'Initech', status: JobStatus.REJECTED, dateApplied: '2026-09-01' }),
    ];

    const visible = visibleApplications(
      list,
      { ...DEFAULT_FILTERS, status: JobStatus.APPLIED },
      DEFAULT_SORT,
    );

    expect(companies(visible)).toEqual(['Globex', 'Acme']);
  });
});

describe('statusUpdatedAt', () => {
  it('is the date of the latest status event', () => {
    const tracked = app({
      statusHistory: [
        { status: JobStatus.APPLIED, date: '2026-09-20T00:00:00+00:00' },
        { status: JobStatus.REJECTED, date: '2026-09-22T00:00:00+00:00' },
      ],
    });

    expect(statusUpdatedAt(tracked)).toBe('2026-09-22');
  });

  it('is blank when there is no history', () => {
    expect(statusUpdatedAt(app())).toBe('');
    expect(statusUpdatedAt(app({ statusHistory: [] }))).toBe('');
  });
});

describe('sorting by status update', () => {
  it('puts the most recently updated first, and never-updated last', () => {
    const list = [
      app({ company: 'Old', statusHistory: [{ status: JobStatus.APPLIED, date: '2026-09-01T00:00:00Z' }] }),
      app({ company: 'None', statusHistory: [] }),
      app({ company: 'New', statusHistory: [{ status: JobStatus.REJECTED, date: '2026-09-22T00:00:00Z' }] }),
    ];

    expect(companies(sortApplications(list, { key: 'statusUpdated', direction: 'desc' }))).toEqual(['New', 'Old', 'None']);
    expect(nextSort(DEFAULT_SORT, 'statusUpdated')).toEqual({ key: 'statusUpdated', direction: 'desc' });
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);

  it('slices out one page and reports how many there are', () => {
    expect(paginate(items, 1, 5)).toEqual({ items: [1, 2, 3, 4, 5], page: 1, pageCount: 3 });
    expect(paginate(items, 3, 5)).toEqual({ items: [11, 12], page: 3, pageCount: 3 });
  });

  it('clamps a page that no longer exists, e.g. after filtering', () => {
    expect(paginate(items, 9, 5).page).toBe(3);
    expect(paginate([], 2, 5)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

describe('STATUS_STYLES', () => {
  it('gives every status its own colour', () => {
    const styles = Object.values(JobStatus).map(status => STATUS_STYLES[status]);

    expect(styles.every(Boolean)).toBe(true);
    expect(new Set(styles).size).toBe(styles.length);
  });
});
