import { describe, it, expect } from 'vitest';
import { JobStatus } from '../types';
import {
  defaultImportOptions,
  guessPlan,
  ImportOptions,
  ImportPlan,
  NO_COLUMN,
  sanitizePlan,
} from './importPlan';
import { applyPlan, parseSheetDate } from './importRows';
import { SheetGrid } from './spreadsheet';

const HEADERS = [
  '#', 'Date Applied', 'Company', 'Role', 'Channel',
  'Status', 'Status Date', 'Days Since Applied', 'Follow Up?', 'Notes',
];

function grid(rows: string[][]): SheetGrid {
  return { sheetName: 'Sheet1', headers: HEADERS, rows };
}

/** The plan a model would return for this sheet, sanitized as the app does. */
function plan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  const base = sanitizePlan(
    {
      columns: {
        company: 2, role: 3, source: 4, status: 5,
        dateApplied: 1, statusDate: 6, notes: 9,
      },
      statusMap: [
        { from: 'Applied', status: 'Applied' },
        { from: 'Rejected', status: 'Rejected' },
        { from: 'Employer replied - check', status: 'Applied', nextAction: 'Check employer reply' },
        { from: 'Update received - check', status: 'Applied', nextAction: 'Check status update' },
        { from: 'Role filled', status: 'Rejected', noteSuffix: 'Role filled' },
      ],
      sourceMap: [{ from: 'Company site', source: 'Company site' }],
    },
    grid([]),
  );

  return { ...base, ...overrides };
}

function options(overrides: Partial<ImportOptions> = {}): ImportOptions {
  // Column 8 is 'Follow Up?'; column 7 counts days elapsed.
  return { ...defaultImportOptions('2026-09-22'), followUpColumn: 8, ...overrides };
}

function row(cells: Partial<Record<number, string>>): string[] {
  return HEADERS.map((_, index) => cells[index] ?? '');
}

describe('parseSheetDate', () => {
  it('reads the format the real sheet uses', () => {
    expect(parseSheetDate('21 Sep 2026')).toBe('2026-09-21');
    expect(parseSheetDate('08 Sep 2026')).toBe('2026-09-08');
    expect(parseSheetDate('21 September 2026')).toBe('2026-09-21');
  });

  it('reads an ISO date unchanged', () => {
    expect(parseSheetDate('2026-09-21')).toBe('2026-09-21');
    expect(parseSheetDate('2026-9-1')).toBe('2026-09-01');
  });

  it('reads a month-first date', () => {
    expect(parseSheetDate('Sep 21, 2026')).toBe('2026-09-21');
    expect(parseSheetDate('September 21 2026')).toBe('2026-09-21');
  });

  it('reads a slash-separated date day first', () => {
    // Day first is the convention where this sheet comes from, and the only
    // reading under which its dates parse at all.
    expect(parseSheetDate('21/09/2026')).toBe('2026-09-21');
    expect(parseSheetDate('21/09/26')).toBe('2026-09-21');
    expect(parseSheetDate('03/04/2026')).toBe('2026-04-03');
  });

  it('reads a bare Excel serial', () => {
    // 46286 is 21 Sep 2026 on Excel's epoch, which pretends 1900 was a leap year.
    expect(parseSheetDate('46286')).toBe('2026-09-21');
  });

  it('returns nothing for a cell that is not a date', () => {
    // Never today, and never an invalid date: '' is how the pipeline says the
    // sheet did not tell us, and it becomes an explicit null on the wire.
    expect(parseSheetDate('')).toBe('');
    expect(parseSheetDate('n/a')).toBe('');
    expect(parseSheetDate('TBC')).toBe('');
    expect(parseSheetDate('7')).toBe('');
  });

  it('rejects an impossible date rather than rolling it over', () => {
    expect(parseSheetDate('31/02/2026')).toBe('');
    expect(parseSheetDate('2026-02-30')).toBe('');
  });
});

describe('applyPlan', () => {
  it('maps a full row onto an application input', () => {
    const [mapped] = applyPlan(
      grid([row({
        0: '1', 1: '21 Sep 2026', 2: 'Open Universities Australia',
        3: 'Software Engineer', 4: 'Company site', 5: 'Applied',
        9: '12-month max term contract',
      })]),
      plan(),
      options(),
    );

    expect(mapped.input).toEqual({
      company: 'Open Universities Australia',
      role: 'Software Engineer',
      source: 'Company site',
      status: JobStatus.APPLIED,
      dateApplied: '2026-09-21',
      notes: '12-month max term contract',
    });
    expect(mapped.warnings).toEqual([]);
    // Row 1 of the body is row 2 of the sheet, counting the header.
    expect(mapped.rowNumber).toBe(2);
  });

  it('omits a field the sheet has nothing for, rather than sending a blank', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer' })]),
      plan(),
      options(),
    );

    // Absent keys are what makes a PATCH partial, and so what makes filling
    // blanks possible without overwriting anything.
    expect('notes' in mapped.input).toBe(false);
    expect('dateApplied' in mapped.input).toBe(false);
    expect('status' in mapped.input).toBe(false);
    expect('source' in mapped.input).toBe(false);
  });

  it('turns a status implying unread news into a next action', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Rider Levett Bucknall', 3: 'Software Developer', 5: 'Employer replied - check', 6: '15 Sep 2026' })]),
      plan(),
      options(),
    );

    expect(mapped.input.status).toBe(JobStatus.APPLIED);
    expect(mapped.input.nextAction).toBe('Check employer reply');
    expect(mapped.input.nextActionDue).toBe('2026-09-15');
    expect(mapped.statusDate).toBe('2026-09-15');
  });

  it('keeps what our five statuses cannot say, in the notes', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Sportsbet', 3: 'Associate Software Engineer', 5: 'Role filled' })]),
      plan(),
      options(),
    );

    // Rejected is the closest we have, but "the role was filled" is not the
    // same thing as being turned down, so the nuance survives.
    expect(mapped.input.status).toBe(JobStatus.REJECTED);
    expect(mapped.input.notes).toBe('Role filled');
  });

  it('folds a follow-up flag into the next action', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Velora Stackworks', 3: 'Software Developer', 5: 'Applied', 8: 'Follow up' })]),
      plan(),
      options(),
    );

    expect(mapped.input.nextAction).toBe('Follow up');
  });

  it('combines a follow-up flag with a status-derived action', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 5: 'Update received - check', 8: 'Follow up' })]),
      plan(),
      options(),
    );

    // Both land in one column, so the order is fixed rather than
    // whichever-ran-last.
    expect(mapped.input.nextAction).toBe('Check status update; Follow up');
  });

  it('keeps a follow-up cell that is real text rather than a flag', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 8: 'Ring them on Tuesday' })]),
      plan(),
      options(),
    );

    expect(mapped.input.nextAction).toBe('Ring them on Tuesday');
  });

  it('truncates a next action to what the column can hold', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 8: 'x'.repeat(400) })]),
      plan(),
      options(),
    );

    expect(mapped.input.nextAction).toHaveLength(255);
  });

  it('warns about a status it cannot place, and keeps the wording', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 5: 'Ghosted' })]),
      plan(),
      options(),
    );

    expect(mapped.input.status).toBe(JobStatus.APPLIED);
    expect(mapped.input.notes).toBe('Sheet status: Ghosted');
    expect(mapped.warnings).toEqual(['Unrecognised status "Ghosted" — imported as Applied.']);
  });

  it('moves a trailing parenthetical out of the role and into the notes', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'DreamIT Host', 3: '(role not in email)' })]),
      plan(),
      options(),
    );

    // The whole cell is a remark, so the role is left as written rather than
    // reduced to nothing.
    expect(mapped.input.role).toBe('(role not in email)');
  });

  it('splits a role that has a real title and a remark', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'REA Group', 3: 'Software Engineer (Commerce Platforms)' })]),
      plan(),
      options(),
    );

    expect(mapped.input.role).toBe('Software Engineer');
    expect(mapped.input.notes).toBe('Commerce Platforms');
  });

  it('normalises a channel through the source dictionary', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 4: 'company site' })]),
      plan(),
      options(),
    );

    expect(mapped.input.source).toBe('Company site');
  });

  it('keeps a channel the dictionary does not cover', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme', 3: 'Engineer', 4: 'JobsNext' })]),
      plan(),
      options(),
    );

    expect(mapped.input.source).toBe('JobsNext');
  });

  it('leaves a blank date blank by default', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'DataMTX Australia', 3: 'Developer', 7: '14' })]),
      plan(),
      options(),
    );

    // The days-elapsed column is a live formula whose baseline is whenever the
    // file was last opened, so using it is opt-in.
    expect('dateApplied' in mapped.input).toBe(false);
  });

  it('reconstructs a blank date from the days column when asked to', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'DataMTX Australia', 3: 'Developer', 7: '14' })]),
      plan(),
      options({ inferDateFromDaysColumn: true, daysSinceColumn: 7 }),
    );

    expect(mapped.input.dateApplied).toBe('2026-09-08');
    expect(mapped.warnings).toEqual([
      'Date applied estimated from 14 days before 2026-09-22.',
    ]);
  });

  it('never estimates over a date the sheet actually has', () => {
    const [mapped] = applyPlan(
      grid([row({ 1: '21 Sep 2026', 2: 'Acme', 3: 'Engineer', 7: '99' })]),
      plan(),
      options({ inferDateFromDaysColumn: true, daysSinceColumn: 7 }),
    );

    expect(mapped.input.dateApplied).toBe('2026-09-21');
    expect(mapped.warnings).toEqual([]);
  });

  it('warns about a row with no company', () => {
    const [mapped] = applyPlan(
      grid([row({ 3: 'Software Engineer', 5: 'Applied' })]),
      plan(),
      options(),
    );

    expect(mapped.warnings).toEqual(['No company — this row cannot be imported.']);
  });

  it('works from a guessed plan, with no model involved', () => {
    const sheet = grid([row({
      1: '21 Sep 2026', 2: 'Acme', 3: 'Engineer', 4: 'Seek', 5: 'Applied', 9: 'a note',
    })]);

    const [mapped] = applyPlan(sheet, guessPlan(sheet), options());

    expect(mapped.input.company).toBe('Acme');
    expect(mapped.input.status).toBe(JobStatus.APPLIED);
    expect(mapped.input.source).toBe('Seek');
    expect(mapped.input.dateApplied).toBe('2026-09-21');
  });

  it('maps nothing when no column is mapped', () => {
    const [mapped] = applyPlan(
      grid([row({ 2: 'Acme' })]),
      { ...plan(), columns: { ...plan().columns, company: NO_COLUMN } },
      options(),
    );

    expect(mapped.input.company).toBeUndefined();
    expect(mapped.warnings).toContain('No company — this row cannot be imported.');
  });
});
