/**
 * Applying an import plan to a spreadsheet's rows.
 *
 * Every rule here is deterministic: the model decides the vocabulary once, in
 * {@link ImportPlan}, and this turns that into payloads without asking it
 * anything further. The same sheet and the same plan always produce the same
 * rows, which is what makes the whole import reviewable and testable.
 *
 * The central rule: a field no column feeds is **absent** from the payload, not
 * `''`. `toApplicationPayload` omits absent keys, so a PATCH only touches what
 * the sheet actually supplied — the basis of filling blanks without
 * overwriting anything.
 */

import { ApplicationInput, JobStatus } from '../types';
import { ImportOptions, ImportPlan, NO_COLUMN, StatusRule } from './importPlan';
import { SheetGrid } from './spreadsheet';

/** A row, mapped but not yet compared against what is already tracked. */
export interface MappedRow {
  /** The row's position in the sheet, 1-based and counting the header. */
  rowNumber: number;
  /** Only the fields the sheet supplied. Never padded with defaults. */
  input: ApplicationInput;
  /** Kept beside the input: only sent when the status is actually written. */
  statusDate: string;
  /** Anything the reviewer should know about this row before committing. */
  warnings: string[];
}

/** `next_action` is a string(255); a longer one would be rejected. */
const NEXT_ACTION_LIMIT = 255;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const date = new Date(Date.UTC(year, month - 1, day));

  // Rejects the 31st of a 30-day month rather than rolling into the next one.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A date cell as 'YYYY-MM-DD', or '' when it is not a date.
 *
 * Never falls back to today, and never yields an invalid date: '' is how the
 * rest of the pipeline says "the sheet did not tell us", and
 * `toApplicationPayload` turns it into an explicit `null`.
 *
 * Slash-separated dates are read **day first**. That is the convention wherever
 * this is likely to be used, and it is the only reading under which the sample
 * data parses at all — but `03/04/2026` is genuinely ambiguous, which is why
 * the review table shows every parsed date before anything is committed.
 *
 * A real Excel date cell never reaches this function: SheetJS hands those back
 * as `Date` objects and {@link SheetGrid} has already formatted them.
 */
export function parseSheetDate(value: string): string {
  const raw = value.trim();
  if (raw === '') return '';

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw);
  if (isoMatch) return iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // '21 Sep 2026', '21 September 2026', '21-Sep-2026'.
  const dayFirst = /^(\d{1,2})[\s\-/]+([A-Za-z]{3,})[\s\-/,]+(\d{4})$/.exec(raw);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];

    return month ? iso(+dayFirst[3], month, +dayFirst[1]) : '';
  }

  // 'Sep 21, 2026', 'September 21 2026'.
  const monthFirst = /^([A-Za-z]{3,})[\s\-/]+(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]+(\d{4})$/.exec(raw);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];

    return month ? iso(+monthFirst[3], month, +monthFirst[2]) : '';
  }

  // '21/09/2026' and '21/09/26', day first.
  const numeric = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(raw);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);

    return iso(year, +numeric[2], +numeric[1]);
  }

  // A bare Excel serial, for a sheet exported without cell formatting. The
  // epoch is 1899-12-30 to absorb Excel's fictional 1900 leap day.
  const serial = /^\d{5}$/.exec(raw);
  if (serial) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);

    return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  return '';
}

/** `base` minus `days`, as 'YYYY-MM-DD'. */
function subtractDays(base: string, days: number): string {
  const parsed = parseSheetDate(base);
  if (parsed === '' || !Number.isFinite(days)) return '';

  const [year, month, day] = parsed.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days));

  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function cell(row: string[], column: number): string {
  return column === NO_COLUMN ? '' : (row[column] ?? '').trim();
}

/** Strip a trailing parenthetical: 'Software Engineer (role not in email)'. */
function splitTrailingNote(value: string): { text: string; note: string } {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(value);

  if (!match || match[1].trim() === '') return { text: value, note: '' };

  return { text: match[1].trim(), note: match[2].trim() };
}

function findStatusRule(rules: StatusRule[], value: string): StatusRule | undefined {
  const key = value.trim().toLowerCase();

  return rules.find(rule => rule.from.trim().toLowerCase() === key);
}

function findSource(plan: ImportPlan, value: string): string {
  const key = value.trim().toLowerCase();

  return plan.sourceMap.find(rule => rule.from.trim().toLowerCase() === key)?.source ?? value;
}

/** Join note fragments, dropping blanks, one per line. */
function joinNotes(parts: string[]): string {
  return parts.map(part => part.trim()).filter(part => part !== '').join('\n');
}

/**
 * Compose `next_action` from the status wording and the follow-up column.
 *
 * Both land in the same column, so the composition is fixed rather than
 * whichever-ran-last: the status-derived action comes first because it names a
 * specific thing to read, and a bare follow-up flag is appended after it.
 */
function composeNextAction(fromStatus: string, followUp: string, fromColumn: string): string {
  const parts: string[] = [];

  if (fromStatus.trim() !== '') parts.push(fromStatus.trim());

  // A follow-up cell holds either a flag ('Follow up', 'yes', 'x') or real
  // text. A flag becomes a standard phrase; anything longer is kept as written.
  const flag = followUp.trim();
  if (flag !== '') {
    const isFlag = /^(follow ?up|y|yes|true|x|✓|1)$/i.test(flag);
    parts.push(isFlag ? 'Follow up' : flag);
  }

  if (fromColumn.trim() !== '' && fromColumn.trim() !== flag) parts.push(fromColumn.trim());

  const unique = parts.filter((part, index) => parts.indexOf(part) === index);

  return unique.join('; ').slice(0, NEXT_ACTION_LIMIT);
}

/**
 * Turn every row of the sheet into the payload it would create.
 *
 * Nothing here compares against existing applications — that is
 * {@link buildRowPlans}'s job. This stage only answers "what does the sheet
 * say about this row".
 */
export function applyPlan(
  grid: SheetGrid,
  plan: ImportPlan,
  options: ImportOptions,
): MappedRow[] {
  const { columns } = plan;

  return grid.rows.map((row, index) => {
    const warnings: string[] = [];
    const input: ApplicationInput = {};
    const noteParts: string[] = [];

    const company = cell(row, columns.company);
    if (company !== '') input.company = company;

    // A trailing parenthetical in the role is a remark, not part of the title:
    // 'Software Engineer (role not in email)'.
    const rawRole = cell(row, columns.role);
    if (rawRole !== '') {
      const { text, note } = splitTrailingNote(rawRole);
      input.role = text;
      if (note !== '') noteParts.push(note);
    }

    for (const field of ['location', 'url'] as const) {
      const value = cell(row, columns[field]);
      if (value !== '') input[field] = value;
    }

    const rawSource = cell(row, columns.source);
    if (rawSource !== '') input.source = findSource(plan, rawSource);

    const statusDate = parseSheetDate(cell(row, columns.statusDate));

    // Status, and the two things its wording can imply.
    let statusAction = '';
    const rawStatus = cell(row, columns.status);

    if (rawStatus !== '') {
      const rule = findStatusRule(plan.statusMap, rawStatus);

      if (rule) {
        input.status = rule.status;
        statusAction = rule.nextAction;
        if (rule.noteSuffix !== '') noteParts.push(rule.noteSuffix);
      } else {
        // Default rather than drop, and say so: an unmapped status is the
        // reviewer's decision, and the original wording is never lost.
        input.status = JobStatus.APPLIED;
        noteParts.push(`Sheet status: ${rawStatus}`);
        warnings.push(`Unrecognised status "${rawStatus}" — imported as Applied.`);
      }
    }

    let dateApplied = parseSheetDate(cell(row, columns.dateApplied));

    if (
      dateApplied === ''
      && options.inferDateFromDaysColumn
      && options.daysSinceColumn !== NO_COLUMN
    ) {
      const days = Number(cell(row, options.daysSinceColumn));

      if (Number.isFinite(days) && days >= 0) {
        dateApplied = subtractDays(options.sheetAsOf, days);

        if (dateApplied !== '') {
          warnings.push(`Date applied estimated from ${days} days before ${options.sheetAsOf}.`);
        }
      }
    }

    if (dateApplied !== '') input.dateApplied = dateApplied;

    const nextAction = composeNextAction(
      statusAction,
      cell(row, options.followUpColumn),
      cell(row, columns.nextAction),
    );

    if (nextAction !== '') {
      input.nextAction = nextAction;

      // Due when the status last moved — the only date the sheet offers for it.
      if (statusDate !== '') input.nextActionDue = statusDate;
    }

    noteParts.unshift(cell(row, columns.notes));

    const notes = joinNotes(noteParts);
    if (notes !== '') input.notes = notes;

    if (company === '') warnings.push('No company — this row cannot be imported.');

    return {
      // +2: one for the header row, one to count from 1 as a spreadsheet does.
      rowNumber: index + 2,
      input,
      statusDate,
      warnings,
    };
  });
}
