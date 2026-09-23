/**
 * Deciding what a spreadsheet row should actually do.
 *
 * Every row gets one of four verdicts, and the rule that matters is "fill
 * blanks only": a row matching something already tracked can fill fields that
 * are currently empty, and can never overwrite one that is not. Two
 * consequences worth stating, because both are load-bearing:
 *
 * 1. **Re-importing the same sheet is a no-op.** A matched row with nothing to
 *    fill is `identical` and makes no request at all.
 * 2. **A status never regresses.** It advances along the pipeline order or it
 *    is left alone, so an old export cannot reopen a rejected application.
 *
 * Matching is on company *and* role, not company alone — people apply to the
 * same company repeatedly, and collapsing those would destroy data.
 */

import { JobApplication, JobStatus } from '../types';
import { STATUS_ORDER } from './applicationTable';
import { ImportField } from './importPlan';
import { MappedRow } from './importRows';

export type RowVerdict = 'create' | 'fill' | 'identical' | 'invalid';

export interface RowPlan {
  rowNumber: number;
  verdict: RowVerdict;
  /** The application this row matched, when it matched one. */
  match: JobApplication | null;
  /**
   * What to send. For `create`, the whole row; for `fill`, *only* the fields
   * that will change; for `identical` and `invalid`, nothing.
   */
  payload: Record<string, unknown>;
  /** The fields a fill will touch, for the review table. */
  fills: ImportField[];
  /** Sent only when the status is being written. */
  statusDate: string;
  warnings: string[];
  /** Why this row got its verdict, in a phrase. */
  reason: string;
  /** What the row is about, for the review table. */
  company: string;
  role: string;
}

/** Company suffixes that carry no identity: 'Acme Pty Ltd' is 'Acme'. */
const LEGAL_SUFFIXES = [
  'pty ltd', 'pty limited', 'pty', 'ltd', 'limited', 'inc', 'incorporated',
  'llc', 'plc', 'gmbh', 'group', 'holdings', 'co', 'corp', 'corporation',
];

/**
 * Reduce a name to what identifies it.
 *
 * Deliberately aggressive: the same employer is written half a dozen ways
 * across a year of a spreadsheet, and an import that treats 'REA Group' and
 * 'REA group' as two companies is worse than useless.
 */
export function normalizeName(value: string): string {
  let name = value.toLowerCase().trim();

  // A trailing parenthetical is a remark, not part of the name.
  name = name.replace(/\s*\([^()]*\)\s*$/, '');
  name = name.replace(/[^a-z0-9]+/g, ' ').trim();

  // Repeatedly, so 'Acme Group Pty Ltd' reduces all the way down.
  let trimmed = true;
  while (trimmed) {
    trimmed = false;

    for (const suffix of LEGAL_SUFFIXES) {
      if (name.endsWith(` ${suffix}`)) {
        name = name.slice(0, -suffix.length - 1).trim();
        trimmed = true;
      }
    }
  }

  return name;
}

/** The key two rows must share to be the same application. */
export function applicationKey(company: string, role: string): string {
  return `${normalizeName(company)}::${normalizeName(role)}`;
}

/** Where a status sits in the pipeline. -1 when it is not one of ours. */
function rank(status: JobStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/**
 * Whether moving from one status to another is forward motion.
 *
 * Rejection is terminal from anywhere, so Offer → Rejected advances while
 * Rejected → Applied does not. Without this, importing a stale export would
 * quietly reopen applications that are long closed.
 */
export function statusAdvances(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false;
  if (to === JobStatus.REJECTED) return true;
  if (from === JobStatus.REJECTED) return false;

  return rank(to) > rank(from);
}

/** An existing value that counts as "nothing there yet". */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * The most recent date the tracker knows about for an application. A sheet row
 * older than this should not be allowed to move its status.
 */
function latestKnownDate(application: JobApplication): string {
  const dates = [application.dateApplied, ...(application.statusHistory ?? []).map(entry => entry.date ?? '')]
    .map(date => date.slice(0, 10))
    .filter(date => date !== '');

  return dates.sort().at(-1) ?? '';
}

/** Fields a fill may write. `status` is handled separately; ids never are. */
const FILLABLE: ImportField[] = ['role', 'location', 'url', 'source', 'dateApplied', 'notes', 'nextAction'];

/**
 * Compare every row against what is already tracked.
 *
 * Rows are considered in sheet order and each `create` joins the pool the later
 * rows match against, so two rows describing the same application produce one
 * create and one no-op rather than a duplicate.
 */
export function buildRowPlans(rows: MappedRow[], existing: JobApplication[]): RowPlan[] {
  const byKey = new Map<string, JobApplication>();

  for (const application of existing) {
    const key = applicationKey(application.company, application.role);

    // First wins: with duplicates already in the tracker, filling the oldest is
    // the least surprising thing to do.
    if (!byKey.has(key)) byKey.set(key, application);
  }

  // Rows earlier in the sheet that will create something. Later rows match
  // against these so one sheet cannot import the same application twice.
  const pending = new Set<string>();

  return rows.map(row => {
    const { input, rowNumber, statusDate, warnings } = row;
    const company = (input.company ?? '').trim();
    const role = (input.role ?? '').trim();

    const base = {
      rowNumber,
      statusDate,
      warnings,
      company,
      role,
      fills: [] as ImportField[],
    };

    if (company === '') {
      return {
        ...base,
        verdict: 'invalid' as const,
        match: null,
        payload: {},
        reason: 'No company to identify this row by.',
      };
    }

    const key = applicationKey(company, role);
    const match = byKey.get(key) ?? null;

    if (match === null) {
      if (pending.has(key)) {
        return {
          ...base,
          verdict: 'identical' as const,
          match: null,
          payload: {},
          reason: 'An earlier row in this sheet is the same application.',
        };
      }

      pending.add(key);

      // The role column is required by the API, and a blank one is the
      // reviewer's to fix — flagged rather than silently invented.
      const payload: Record<string, unknown> = { ...input };

      if (role === '') {
        payload.role = 'Unknown role';
        base.warnings = [...warnings, 'No role in the sheet — imported as "Unknown role".'];
      }

      return {
        ...base,
        verdict: 'create' as const,
        match: null,
        payload,
        reason: 'New — not in your tracker yet.',
      };
    }

    const existingRecord = match as unknown as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    const fills: ImportField[] = [];

    for (const field of FILLABLE) {
      const value = (input as Record<string, unknown>)[field];

      if (value === undefined || isBlank(value)) continue;
      if (!isBlank(existingRecord[field])) continue;

      payload[field] = value;
      fills.push(field);
    }

    // Status is not a blank-fill: it moves forward or not at all, and only on
    // the word of a sheet row at least as recent as what we already know.
    if (input.status !== undefined && statusAdvances(match.status, input.status)) {
      const known = latestKnownDate(match);

      if (statusDate === '' || known === '' || statusDate >= known) {
        payload.status = input.status;
        fills.push('status');

        // Only sent alongside a status: the API logs an event only when the
        // status changes, so sending it otherwise is noise.
        if (statusDate !== '') payload.statusDate = statusDate;
      } else {
        base.warnings = [
          ...base.warnings,
          `Status left alone: the sheet's ${statusDate} is older than what is already recorded.`,
        ];
      }
    }

    // A note the sheet adds to one that already exists is appended rather than
    // dropped, because notes accumulate rather than replace.
    if (
      input.notes !== undefined
      && input.notes.trim() !== ''
      && !isBlank(match.notes)
      && !match.notes.includes(input.notes.trim())
    ) {
      payload.notes = `${match.notes}\n${input.notes.trim()}`;
      if (!fills.includes('notes')) fills.push('notes');
    }

    if (fills.length === 0) {
      return {
        ...base,
        verdict: 'identical' as const,
        match,
        payload: {},
        reason: `Already tracked as #${match.id}, with nothing to fill.`,
      };
    }

    return {
      ...base,
      fills,
      verdict: 'fill' as const,
      match,
      payload,
      reason: `Fills ${fills.length} blank ${fills.length === 1 ? 'field' : 'fields'} on #${match.id}.`,
    };
  });
}

export interface ImportSummary {
  create: number;
  fill: number;
  identical: number;
  invalid: number;
}

export function summarize(plans: RowPlan[]): ImportSummary {
  return plans.reduce<ImportSummary>(
    (summary, plan) => ({ ...summary, [plan.verdict]: summary[plan.verdict] + 1 }),
    { create: 0, fill: 0, identical: 0, invalid: 0 },
  );
}

/** The verdicts that do something, and so are checked by default. */
export function isActionable(verdict: RowVerdict): boolean {
  return verdict === 'create' || verdict === 'fill';
}
