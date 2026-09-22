import { describe, it, expect } from 'vitest';
import { JobStatus } from '../types';
import {
  distinctColumnValues,
  distinctValues,
  guessPlan,
  mappingDifferences,
  mergePlans,
  NO_COLUMN,
  sampleRows,
  sanitizePlan,
} from './importPlan';
import { SheetGrid } from './spreadsheet';

/** The real sheet this feature was built for. */
const REAL_HEADERS = [
  '#', 'Date Applied', 'Company', 'Role', 'Channel',
  'Status', 'Status Date', 'Days Since Applied', 'Follow Up?', 'Notes',
];

const REAL_ROWS = [
  ['1', '21 Sep 2026', 'Open Universities Australia', 'Software Engineer', 'Company site', 'Applied', '', '1', '', '12-month max term contract'],
  ['2', '21 Sep 2026', 'DreamIT Host', '(role not in email)', 'LinkedIn', 'Applied', '', '1', '', ''],
  ['4', '20 Sep 2026', 'Cullen Jewellery', 'Software Engineer', 'Company site', 'Rejected', '22 Sep 2026', '2', '', ''],
  ['6', '', 'DataMTX Australia', 'AI-Native Full-Stack Developer', 'Seek', 'Rejected', '18 Sep 2026', '', '', ''],
  ['9', '15 Sep 2026', 'Velora Stackworks', 'Software Developer', 'JobsNext', 'Applied', '', '7', 'Follow up', ''],
  ['12', '', 'Rider Levett Bucknall', 'Software Developer', 'Seek', 'Employer replied - check', '15 Sep 2026', '', '', 'Two messages'],
  ['27', '21 Aug 2026', 'Sportsbet', 'Associate Software Engineer', 'Company site', 'Role filled', '02 Sep 2026', '32', '', ''],
];

function grid(headers: string[], rows: string[][]): SheetGrid {
  return { sheetName: 'Sheet1', headers, rows };
}

const realGrid = grid(REAL_HEADERS, REAL_ROWS);

describe('guessPlan', () => {
  it('maps the real sheet without any help from a model', () => {
    const { columns } = guessPlan(realGrid);

    expect(columns.company).toBe(2);
    expect(columns.role).toBe(3);
    expect(columns.source).toBe(4);
    expect(columns.status).toBe(5);
    expect(columns.statusDate).toBe(6);
    expect(columns.notes).toBe(9);
    expect(columns.dateApplied).toBe(1);
  });

  it('never claims the row number or the days-elapsed column as a date', () => {
    // The classic false positive: a column of small integers beside a column
    // of dates, which a loose parser reads as dates in the 1900s.
    const { columns } = guessPlan(realGrid);

    expect(columns.dateApplied).not.toBe(0);
    expect(columns.dateApplied).not.toBe(7);
    expect(columns.statusDate).not.toBe(7);
  });

  it('prefers "Date Applied" over "Status Date" for the application date', () => {
    const { columns } = guessPlan(realGrid);

    expect(REAL_HEADERS[columns.dateApplied]).toBe('Date Applied');
    expect(REAL_HEADERS[columns.statusDate]).toBe('Status Date');
  });

  it('maps a sheet whose columns are named differently', () => {
    const { columns } = guessPlan(grid(
      ['Employer', 'Job Title', 'Via', 'Outcome', 'Applied On', 'Comments'],
      [['Acme', 'Engineer', 'Seek', 'Applied', '01 Mar 2026', 'nice team']],
    ));

    expect(columns.company).toBe(0);
    expect(columns.role).toBe(1);
    expect(columns.source).toBe(2);
    expect(columns.status).toBe(3);
    expect(columns.dateApplied).toBe(4);
    expect(columns.notes).toBe(5);
  });

  it('matches a header by substring when there is no exact name', () => {
    const { columns } = guessPlan(grid(
      ['Company Name', 'Role / Title'],
      [['Acme', 'Engineer']],
    ));

    expect(columns.company).toBe(0);
    expect(columns.role).toBe(1);
  });

  it('leaves a missing column unmapped', () => {
    const { columns } = guessPlan(grid(['Company', 'Role'], [['Acme', 'Engineer']]));

    expect(columns.source).toBe(NO_COLUMN);
    expect(columns.status).toBe(NO_COLUMN);
    expect(columns.dateApplied).toBe(NO_COLUMN);
    expect(columns.notes).toBe(NO_COLUMN);
  });

  it('finds a date column the headers do not name', () => {
    const { columns } = guessPlan(grid(
      ['Company', 'Role', 'When'],
      [['Acme', 'Engineer', '01 Mar 2026'], ['Globex', 'Dev', '04 Mar 2026']],
    ));

    expect(columns.dateApplied).toBe(2);
  });

  it('never maps two fields to the same column', () => {
    const { columns } = guessPlan(realGrid);
    const used = Object.values(columns).filter(index => index !== NO_COLUMN);

    expect(new Set(used).size).toBe(used.length);
  });

  it('translates only the statuses that are exactly ours', () => {
    const { statusMap } = guessPlan(realGrid);

    // 'Employer replied - check' and 'Role filled' are left out on purpose:
    // the review form shows them as needing a choice rather than guessing.
    expect(statusMap.map(rule => rule.from)).toEqual(['Applied', 'Rejected']);
    expect(statusMap[0].status).toBe(JobStatus.APPLIED);
  });
});

describe('distinctColumnValues', () => {
  it('includes the status and channel vocabularies', () => {
    const values = distinctColumnValues(realGrid);

    expect(values[5]).toContain('Employer replied - check');
    expect(values[5]).toContain('Role filled');
    expect(values[4]).toEqual(['Company site', 'LinkedIn', 'Seek', 'JobsNext']);
  });

  it('excludes a column where every row differs', () => {
    // Free text teaches the model nothing and costs tokens.
    const values = distinctColumnValues(realGrid);

    expect(values[2]).toBeUndefined();
  });

  it('excludes a column with more distinct values than the cap', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [`value ${i}`, 'same']);
    const values = distinctColumnValues(grid(['Many', 'Few'], rows), 10);

    expect(values[0]).toBeUndefined();
    expect(values[1]).toEqual(['same']);
  });

  it('collapses values that differ only in case', () => {
    expect(distinctValues(grid(['Status'], [['Applied'], ['applied']]), 0)).toEqual(['Applied']);
  });
});

describe('sampleRows', () => {
  it('caps the sample at the limit the endpoint accepts', () => {
    expect(sampleRows(grid(['A'], Array.from({ length: 20 }, () => ['x'])))).toHaveLength(8);
  });
});

describe('sanitizePlan', () => {
  it('clamps an index outside the header row', () => {
    const { columns } = sanitizePlan(
      { columns: { company: 0, role: 1, location: 99, url: -7, source: 'the channel' } },
      grid(['Company', 'Role'], [['Acme', 'Engineer']]),
    );

    expect(columns.company).toBe(0);
    expect(columns.location).toBe(NO_COLUMN);
    expect(columns.url).toBe(NO_COLUMN);
    expect(columns.source).toBe(NO_COLUMN);
    expect(columns.statusDate).toBe(NO_COLUMN);
  });

  it('reads an index sent as a numeric string', () => {
    const { columns } = sanitizePlan(
      { columns: { company: '0', role: '1' } },
      grid(['Company', 'Role'], [['Acme', 'Engineer']]),
    );

    expect(columns.company).toBe(0);
    expect(columns.role).toBe(1);
  });

  it('drops a status that is not one of ours', () => {
    const { statusMap } = sanitizePlan(
      {
        columns: { company: 0 },
        statusMap: [
          { from: 'Applied', status: 'Applied' },
          { from: 'Ghosted', status: 'Ghosted' },
          { from: '', status: 'Applied' },
          'not an object',
        ],
      },
      grid(['Company'], [['Acme']]),
    );

    expect(statusMap).toHaveLength(1);
    expect(statusMap[0]).toEqual({
      from: 'Applied',
      status: JobStatus.APPLIED,
      nextAction: '',
      noteSuffix: '',
    });
  });

  it('keeps the first of two rules for the same wording', () => {
    const { statusMap, sourceMap } = sanitizePlan(
      {
        columns: { company: 0 },
        statusMap: [
          { from: 'Rejected', status: 'Rejected', noteSuffix: 'first' },
          { from: 'rejected', status: 'Applied', noteSuffix: 'second' },
        ],
        sourceMap: [
          { from: 'Seek', source: 'Seek' },
          { from: 'seek', source: 'Seek Australia' },
          { from: 'LinkedIn', source: '' },
        ],
      },
      grid(['Company'], [['Acme']]),
    );

    expect(statusMap).toHaveLength(1);
    expect(statusMap[0].noteSuffix).toBe('first');
    expect(sourceMap).toEqual([{ from: 'Seek', source: 'Seek' }]);
  });

  it('survives a garbage answer', () => {
    const { columns, statusMap, sourceMap, notes } = sanitizePlan(null, grid(['Company'], [['Acme']]));

    expect(columns.company).toBe(NO_COLUMN);
    expect(statusMap).toEqual([]);
    expect(sourceMap).toEqual([]);
    expect(notes).toBe('');
  });
});

describe('mergePlans', () => {
  it('falls back to the guess for anything the model left unmapped', () => {
    const guess = guessPlan(realGrid);
    const ai = sanitizePlan({ columns: { company: 2, role: 3 }, statusMap: [] }, realGrid);
    const merged = mergePlans(guess, ai);

    expect(merged.columns.company).toBe(2);
    // The model said nothing about these; the guess still found them.
    expect(merged.columns.status).toBe(5);
    expect(merged.columns.notes).toBe(9);
  });

  it('prefers the model where the two disagree', () => {
    const guess = guessPlan(realGrid);
    const ai = sanitizePlan(
      { columns: { company: 2, role: 3, notes: 8 }, statusMap: [] },
      realGrid,
    );

    expect(mergePlans(guess, ai).columns.notes).toBe(8);
  });

  it('keeps the guess\'s statuses the model did not cover', () => {
    const guess = guessPlan(realGrid);
    const ai = sanitizePlan(
      {
        columns: { company: 2, role: 3 },
        statusMap: [{ from: 'Role filled', status: 'Rejected', noteSuffix: 'Role filled' }],
      },
      realGrid,
    );

    const froms = mergePlans(guess, ai).statusMap.map(rule => rule.from);

    expect(froms).toContain('Role filled');
    expect(froms).toContain('Applied');
    expect(froms).toContain('Rejected');
  });

  it('never lets two fields read the same column', () => {
    const guess = guessPlan(realGrid);
    // The model claims column 9 for notes; the guess had it too.
    const ai = sanitizePlan(
      { columns: { company: 2, role: 3, nextAction: 9, notes: 9 }, statusMap: [] },
      realGrid,
    );

    const columns = mergePlans(guess, ai).columns;
    const used = Object.values(columns).filter(index => index !== NO_COLUMN);

    expect(new Set(used).size).toBe(used.length);
  });

  it('reports which fields the model changed, for the review form', () => {
    const guess = guessPlan(realGrid);
    // Column 0 is '#', which the guess claimed for nothing.
    const ai = sanitizePlan(
      { columns: { ...guess.columns, notes: 0 }, statusMap: [] },
      realGrid,
    );

    expect(mappingDifferences(guess, mergePlans(guess, ai))).toEqual(['notes']);
  });

  it('drops the loser when the model points two fields at one column', () => {
    const guess = guessPlan(realGrid);
    // Notes takes column 8, which the guess had mapped to nextAction, so
    // nextAction ends up unmapped rather than reading the same cell twice.
    const ai = sanitizePlan(
      { columns: { ...guess.columns, notes: 8 }, statusMap: [] },
      realGrid,
    );

    const columns = mergePlans(guess, ai).columns;

    expect(columns.notes).toBe(8);
    expect(columns.nextAction).toBe(NO_COLUMN);
  });
});
