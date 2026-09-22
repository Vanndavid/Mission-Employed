/**
 * The plan for reading a spreadsheet: which column feeds which tracker field,
 * and how the sheet's own status and channel wording translate into ours.
 *
 * A plan comes from one of two places, and the shape is identical either way:
 * {@link guessPlan} works it out from header names and value shapes, and
 * `POST /api/ai/import/plan` asks a model. The AI version is advisory — the
 * importer shows the resolved plan as an editable form, using the guess as the
 * baseline it diffs against, so a wrong answer costs one dropdown rather than
 * a sheet full of bad rows. The guess is also the whole fallback when the AI is
 * unreachable or the user is not premium.
 *
 * Columns are referred to by index, never by header text, so a blank or
 * duplicated header cannot break the join.
 */

import { JobStatus } from '../types';
import { parseSheetDate } from './importRows';
import { SheetGrid } from './spreadsheet';

/** The tracker fields a spreadsheet column can feed. */
export const IMPORT_FIELDS = [
  'company',
  'role',
  'location',
  'url',
  'source',
  'status',
  'dateApplied',
  'statusDate',
  'notes',
  'nextAction',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Index meaning "no column feeds this field". Matches the API's sentinel. */
export const NO_COLUMN = -1;

export type ColumnMapping = Record<ImportField, number>;

/** How one of the sheet's status words becomes a status of ours. */
export interface StatusRule {
  /** The sheet's wording, verbatim. */
  from: string;
  status: JobStatus;
  /** What the user still has to do, when the wording implies something. */
  nextAction: string;
  /** Meaning our five statuses cannot hold, preserved in the notes. */
  noteSuffix: string;
}

export interface SourceRule {
  from: string;
  source: string;
}

export interface ImportPlan {
  columns: ColumnMapping;
  statusMap: StatusRule[];
  sourceMap: SourceRule[];
  /** How the date cells are written, for example 'D MMM YYYY'. Advisory. */
  dateFormatHint: string;
  /** One sentence for the person reviewing the plan. */
  notes: string;
}

export interface ImportOptions {
  /**
   * Reconstruct a blank "date applied" from a column counting days elapsed.
   *
   * Off by default and deliberately so. Such a column is usually a live
   * formula whose baseline is whenever the file was last opened, not when it
   * is imported, so switching this on can invent plausible-looking dates. It
   * never overwrites a date the sheet actually has.
   */
  inferDateFromDaysColumn: boolean;
  /** The column counting days elapsed, when the option above is on. */
  daysSinceColumn: number;
  /** 'YYYY-MM-DD' baseline the day count is subtracted from. */
  sheetAsOf: string;
  /** A column flagging rows needing a follow-up, folded into `nextAction`. */
  followUpColumn: number;
}

export function emptyColumnMapping(): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map(field => [field, NO_COLUMN])) as ColumnMapping;
}

export function defaultImportOptions(today: string): ImportOptions {
  return {
    inferDateFromDaysColumn: false,
    daysSinceColumn: NO_COLUMN,
    sheetAsOf: today,
    followUpColumn: NO_COLUMN,
  };
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Header synonyms, most specific first.
 *
 * Order matters within a field: 'date applied' has to beat a bare 'date', and
 * 'status date' has to be tried before 'status' so it does not get claimed as
 * the status column itself.
 */
const HEADER_SYNONYMS: Array<[ImportField, string[]]> = [
  ['company', ['company', 'employer', 'organisation', 'organization', 'firm', 'business']],
  ['role', ['role', 'job title', 'position', 'title', 'job', 'vacancy']],
  ['location', ['location', 'city', 'where', 'place', 'office']],
  ['url', ['url', 'link', 'job link', 'posting', 'advert', 'listing']],
  ['source', ['source', 'channel', 'via', 'platform', 'job board', 'board', 'found via', 'applied via']],
  ['statusDate', ['status date', 'last update', 'updated', 'last contact', 'status changed', 'response date']],
  ['status', ['status', 'stage', 'outcome', 'result', 'progress']],
  ['dateApplied', ['date applied', 'applied date', 'application date', 'applied on', 'applied', 'date sent', 'date']],
  ['nextAction', ['next action', 'follow up', 'followup', 'action', 'next step', 'to do', 'todo']],
  ['notes', ['notes', 'note', 'comments', 'comment', 'remarks', 'detail', 'details']],
];

/** A column of dates, judged by its values rather than its header. */
function looksLikeDates(grid: SheetGrid, column: number): boolean {
  const values = grid.rows.map(row => (row[column] ?? '').trim()).filter(value => value !== '');
  if (values.length === 0) return false;

  const dated = values.filter(value => parseSheetDate(value) !== '').length;

  return dated / values.length > 0.6;
}

/**
 * A column counting something — row numbers, or days elapsed.
 *
 * Worth detecting because it is the classic false positive: a column of small
 * integers next to a column of dates reads as a date to a loose parser, and
 * importing it would set every application's date to the 1900s.
 */
function looksLikeCount(grid: SheetGrid, column: number): boolean {
  const values = grid.rows.map(row => (row[column] ?? '').trim()).filter(value => value !== '');
  if (values.length === 0) return false;

  return values.every(value => /^\d{1,4}$/.test(value));
}

/**
 * Work out a mapping from header names and, where those are unhelpful, from
 * what the columns actually contain.
 */
export function guessPlan(grid: SheetGrid): ImportPlan {
  const columns = emptyColumnMapping();
  const claimed = new Set<number>();
  const normalized = grid.headers.map(normalizeHeader);

  // Exact header matches first, so a sheet that names its columns plainly is
  // never overridden by a fuzzy one.
  for (const [field, synonyms] of HEADER_SYNONYMS) {
    for (const synonym of synonyms) {
      const index = normalized.findIndex((header, i) => header === synonym && !claimed.has(i));

      if (index !== -1) {
        columns[field] = index;
        claimed.add(index);
        break;
      }
    }
  }

  // Then substring matches, for 'Company Name' or 'Role / Title'.
  for (const [field, synonyms] of HEADER_SYNONYMS) {
    if (columns[field] !== NO_COLUMN) continue;

    for (const synonym of synonyms) {
      const index = normalized.findIndex(
        (header, i) => header.includes(synonym) && !claimed.has(i),
      );

      if (index !== -1) {
        columns[field] = index;
        claimed.add(index);
        break;
      }
    }
  }

  // A date column the headers did not name. Counting columns are excluded
  // explicitly — see looksLikeCount.
  if (columns.dateApplied === NO_COLUMN) {
    const index = grid.headers.findIndex(
      (_, i) => !claimed.has(i) && !looksLikeCount(grid, i) && looksLikeDates(grid, i),
    );

    if (index !== -1) {
      columns.dateApplied = index;
      claimed.add(index);
    }
  }

  // A column the header table claimed as a date but whose values are counts is
  // not a date at all; better to import nothing than the 1900s.
  for (const field of ['dateApplied', 'statusDate'] as const) {
    const index = columns[field];

    if (index !== NO_COLUMN && looksLikeCount(grid, index)) {
      columns[field] = NO_COLUMN;
      claimed.delete(index);
    }
  }

  return {
    columns,
    statusMap: guessStatusMap(grid, columns.status),
    sourceMap: [],
    dateFormatHint: '',
    notes: '',
  };
}

/**
 * Translate the status column's own words without a model.
 *
 * Only exact matches against our five statuses are trusted. Anything else is
 * left out on purpose: the review form shows an unmapped value as needing a
 * choice, which is far better than guessing wrong quietly.
 */
function guessStatusMap(grid: SheetGrid, statusColumn: number): StatusRule[] {
  if (statusColumn === NO_COLUMN) return [];

  const ours = new Map(Object.values(JobStatus).map(status => [status.toLowerCase(), status]));
  const rules: StatusRule[] = [];
  const seen = new Set<string>();

  for (const value of distinctValues(grid, statusColumn)) {
    const key = value.toLowerCase();
    const match = ours.get(key);

    if (match === undefined || seen.has(key)) continue;

    seen.add(key);
    rules.push({ from: value, status: match, nextAction: '', noteSuffix: '' });
  }

  return rules;
}

/** The distinct non-blank values in a column, in the order they appear. */
export function distinctValues(grid: SheetGrid, column: number): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const row of grid.rows) {
    const value = (row[column] ?? '').trim();
    if (value === '') continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    values.push(value);
  }

  return values;
}

/** Columns with few enough distinct values to count as a vocabulary. */
export const MAX_DISTINCT_VALUES = 40;

/**
 * The columns worth sending to the model as value dictionaries.
 *
 * This is what lets the model translate every status in the sheet while only
 * being shown a handful of rows. Columns with many distinct values are free
 * text — sending them would cost tokens and teach it nothing.
 */
export function distinctColumnValues(
  grid: SheetGrid,
  maxDistinct: number = MAX_DISTINCT_VALUES,
): Record<number, string[]> {
  const byColumn: Record<number, string[]> = {};

  grid.headers.forEach((_, column) => {
    const values = distinctValues(grid, column);

    // A column where every row differs is free text, not a vocabulary.
    if (values.length === 0 || values.length > maxDistinct) return;
    if (values.length === grid.rows.length && grid.rows.length > 4) return;

    byColumn[column] = values;
  });

  return byColumn;
}

/** Up to `limit` sample rows, for the model to judge column contents by. */
export function sampleRows(grid: SheetGrid, limit = 8): string[][] {
  return grid.rows.slice(0, limit);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

/**
 * Narrow whatever the endpoint answered with into a usable plan.
 *
 * The API already clamps and whitelists, but this runs over its answer again
 * rather than trusting the shape: it is the only thing standing between a
 * model's output and a payload, and it is far cheaper to test here than to
 * debug from a bad import.
 */
export function sanitizePlan(raw: unknown, grid: SheetGrid): ImportPlan {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawColumns = (source.columns ?? {}) as Record<string, unknown>;
  const columns = emptyColumnMapping();

  for (const field of IMPORT_FIELDS) {
    const value = rawColumns[field];
    const index = typeof value === 'number' && Number.isInteger(value)
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : NO_COLUMN;

    columns[field] = index >= 0 && index < grid.headers.length ? index : NO_COLUMN;
  }

  const ours = new Set<string>(Object.values(JobStatus));
  const statusMap: StatusRule[] = [];
  const statusSeen = new Set<string>();

  for (const entry of Array.isArray(source.statusMap) ? source.statusMap : []) {
    if (typeof entry !== 'object' || entry === null) continue;

    const row = entry as Record<string, unknown>;
    const from = asString(row.from).trim();
    const status = asString(row.status).trim();

    if (from === '' || !ours.has(status)) continue;

    const key = from.toLowerCase();
    if (statusSeen.has(key)) continue;

    statusSeen.add(key);
    statusMap.push({
      from,
      status: status as JobStatus,
      nextAction: asString(row.nextAction).trim(),
      noteSuffix: asString(row.noteSuffix).trim(),
    });
  }

  const sourceMap: SourceRule[] = [];
  const sourceSeen = new Set<string>();

  for (const entry of Array.isArray(source.sourceMap) ? source.sourceMap : []) {
    if (typeof entry !== 'object' || entry === null) continue;

    const row = entry as Record<string, unknown>;
    const from = asString(row.from).trim();
    const mapped = asString(row.source).trim();

    if (from === '' || mapped === '') continue;

    const key = from.toLowerCase();
    if (sourceSeen.has(key)) continue;

    sourceSeen.add(key);
    sourceMap.push({ from, source: mapped });
  }

  return {
    columns,
    statusMap,
    sourceMap,
    dateFormatHint: asString(source.dateFormatHint).trim(),
    notes: asString(source.notes).trim(),
  };
}

/**
 * Merge a model's plan over the guess.
 *
 * The guess supplies anything the model left unmapped, so an AI answer is
 * never worse than no answer. Statuses the model did not cover fall back to
 * the exact matches the guess found.
 */
export function mergePlans(guess: ImportPlan, ai: ImportPlan): ImportPlan {
  const columns = emptyColumnMapping();
  const taken = new Set<number>();

  for (const field of IMPORT_FIELDS) {
    const chosen = ai.columns[field] !== NO_COLUMN ? ai.columns[field] : guess.columns[field];

    // Two fields cannot read the same column: the second one loses, rather
    // than silently importing the same cell twice.
    if (chosen !== NO_COLUMN && !taken.has(chosen)) {
      columns[field] = chosen;
      taken.add(chosen);
    }
  }

  const statusMap = [...ai.statusMap];
  const covered = new Set(statusMap.map(rule => rule.from.toLowerCase()));

  for (const rule of guess.statusMap) {
    if (!covered.has(rule.from.toLowerCase())) statusMap.push(rule);
  }

  return {
    columns,
    statusMap,
    sourceMap: ai.sourceMap,
    dateFormatHint: ai.dateFormatHint || guess.dateFormatHint,
    notes: ai.notes,
  };
}

/** The fields the AI mapped differently from the guess, for the review form. */
export function mappingDifferences(guess: ImportPlan, resolved: ImportPlan): ImportField[] {
  return IMPORT_FIELDS.filter(field => guess.columns[field] !== resolved.columns[field]);
}
