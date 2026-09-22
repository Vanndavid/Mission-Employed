import { describe, it, expect } from 'vitest';
import { JobApplication, JobStatus } from '../types';
import {
  applicationKey,
  buildRowPlans,
  normalizeName,
  RowPlan,
  statusAdvances,
  summarize,
} from './importMerge';
import { MappedRow } from './importRows';

let nextId = 1;

/** An application as the API serializes one: blanks are '', not null. */
function tracked(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: nextId++,
    company: 'Acme Corp',
    role: 'Backend Engineer',
    location: '',
    url: '',
    source: '',
    dateApplied: '',
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

function mapped(overrides: Partial<MappedRow> = {}): MappedRow {
  return {
    rowNumber: 2,
    input: { company: 'Acme Corp', role: 'Backend Engineer' },
    statusDate: '',
    warnings: [],
    ...overrides,
  };
}

/**
 * Feed a committed plan back into the tracker, so a second pass over the same
 * sheet sees what the first one would have created.
 */
function applyToTracker(existing: JobApplication[], plans: RowPlan[]): JobApplication[] {
  const result = [...existing];

  for (const plan of plans) {
    if (plan.verdict === 'create') {
      result.push(tracked(plan.payload as Partial<JobApplication>));
    }

    if (plan.verdict === 'fill' && plan.match) {
      const index = result.findIndex(application => application.id === plan.match!.id);
      if (index !== -1) result[index] = { ...result[index], ...plan.payload } as JobApplication;
    }
  }

  return result;
}

describe('normalizeName', () => {
  it('ignores case and punctuation', () => {
    expect(normalizeName('REA Group')).toBe(normalizeName('rea  group!'));
  });

  it('strips a legal suffix', () => {
    expect(normalizeName('Acme Pty Ltd')).toBe('acme');
    expect(normalizeName('Acme Limited')).toBe('acme');
    expect(normalizeName('Acme Group Pty Ltd')).toBe('acme');
  });

  it('strips a trailing parenthetical', () => {
    expect(normalizeName('(unknown - via Indeed)')).toBe('');
    expect(normalizeName('rhiaus (recruiter)')).toBe('rhiaus');
  });
});

describe('applicationKey', () => {
  it('is company and role together, not company alone', () => {
    // People apply to one company repeatedly; collapsing those loses data.
    expect(applicationKey('REA Group', 'Software Engineer'))
      .not.toBe(applicationKey('REA Group', 'Associate Software Engineer'));
  });
});

describe('statusAdvances', () => {
  it('moves forward along the pipeline', () => {
    expect(statusAdvances(JobStatus.SAVED, JobStatus.APPLIED)).toBe(true);
    expect(statusAdvances(JobStatus.APPLIED, JobStatus.INTERVIEWING)).toBe(true);
    expect(statusAdvances(JobStatus.INTERVIEWING, JobStatus.OFFER)).toBe(true);
  });

  it('treats rejection as reachable from anywhere', () => {
    expect(statusAdvances(JobStatus.OFFER, JobStatus.REJECTED)).toBe(true);
    expect(statusAdvances(JobStatus.SAVED, JobStatus.REJECTED)).toBe(true);
  });

  it('never reopens a rejected application', () => {
    // Importing a stale export must not undo a closed application.
    expect(statusAdvances(JobStatus.REJECTED, JobStatus.APPLIED)).toBe(false);
    expect(statusAdvances(JobStatus.REJECTED, JobStatus.INTERVIEWING)).toBe(false);
  });

  it('never goes backwards, and never sideways', () => {
    expect(statusAdvances(JobStatus.INTERVIEWING, JobStatus.APPLIED)).toBe(false);
    expect(statusAdvances(JobStatus.APPLIED, JobStatus.APPLIED)).toBe(false);
  });
});

describe('buildRowPlans', () => {
  it('creates a row that is not tracked yet', () => {
    const [plan] = buildRowPlans([mapped()], []);

    expect(plan.verdict).toBe('create');
    expect(plan.match).toBeNull();
    expect(plan.payload).toEqual({ company: 'Acme Corp', role: 'Backend Engineer' });
  });

  it('matches through spelling differences', () => {
    const existing = [tracked({ company: 'Acme Pty Ltd', role: 'Backend Engineer' })];
    const [plan] = buildRowPlans([mapped({ input: { company: 'ACME', role: 'backend engineer' } })], existing);

    expect(plan.verdict).toBe('identical');
  });

  it('fills only the fields that are currently blank', () => {
    const existing = [tracked({ notes: 'already written', location: '' })];

    const [plan] = buildRowPlans([mapped({
      input: {
        company: 'Acme Corp',
        role: 'Backend Engineer',
        location: 'Sydney',
        source: 'Seek',
      },
    })], existing);

    expect(plan.verdict).toBe('fill');
    expect(plan.fills.sort()).toEqual(['location', 'source']);
    expect(plan.payload).toEqual({ location: 'Sydney', source: 'Seek' });
  });

  it('never overwrites a field that already has a value', () => {
    // The headline guarantee of the whole feature.
    const existing = [tracked({
      location: 'Melbourne',
      url: 'https://kept.test',
      source: 'LinkedIn',
      dateApplied: '2026-01-01',
    })];

    const [plan] = buildRowPlans([mapped({
      input: {
        company: 'Acme Corp',
        role: 'Backend Engineer',
        location: 'Sydney',
        url: 'https://sheet.test',
        source: 'Seek',
        dateApplied: '2026-09-01',
      },
    })], existing);

    expect(plan.verdict).toBe('identical');
    expect(plan.payload).toEqual({});
  });

  it('is a no-op for a matched row with nothing to fill', () => {
    const [plan] = buildRowPlans([mapped()], [tracked()]);

    expect(plan.verdict).toBe('identical');
    expect(plan.payload).toEqual({});
    expect(plan.reason).toContain('nothing to fill');
  });

  it('imports the same sheet twice with no second round of changes', () => {
    // The guarantee that makes the importer safe to re-run.
    const rows = [
      mapped({ rowNumber: 2, input: { company: 'Acme', role: 'Engineer', location: 'Sydney', status: JobStatus.APPLIED } }),
      mapped({ rowNumber: 3, input: { company: 'Globex', role: 'Developer', notes: 'via a friend' } }),
    ];

    const first = buildRowPlans(rows, []);
    expect(first.map(plan => plan.verdict)).toEqual(['create', 'create']);

    const second = buildRowPlans(rows, applyToTracker([], first));
    expect(second.map(plan => plan.verdict)).toEqual(['identical', 'identical']);
    expect(second.every(plan => Object.keys(plan.payload).length === 0)).toBe(true);
  });

  it('fills a field blanked since the last import, and only that field', () => {
    const rows = [mapped({
      input: { company: 'Acme', role: 'Engineer', location: 'Sydney', notes: 'a note' },
    })];

    const tracker = applyToTracker([], buildRowPlans(rows, []));
    // The user clears one field in the app.
    const cleared = tracker.map(application => ({ ...application, location: '' }));

    const [plan] = buildRowPlans(rows, cleared);

    expect(plan.verdict).toBe('fill');
    expect(plan.fills).toEqual(['location']);
  });

  it('advances a status and dates the event from the sheet', () => {
    const existing = [tracked({ status: JobStatus.APPLIED, dateApplied: '2026-08-01' })];

    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', status: JobStatus.REJECTED },
      statusDate: '2026-09-10',
    })], existing);

    expect(plan.verdict).toBe('fill');
    expect(plan.payload).toEqual({ status: JobStatus.REJECTED, statusDate: '2026-09-10' });
  });

  it('does not send a status date with a fill that leaves the status alone', () => {
    // The API only logs an event when the status changes, so sending it
    // otherwise is noise.
    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', location: 'Sydney' },
      statusDate: '2026-09-10',
    })], [tracked()]);

    expect(plan.payload).toEqual({ location: 'Sydney' });
    expect('statusDate' in plan.payload).toBe(false);
  });

  it('refuses to move a status on the word of an older row', () => {
    const existing = [tracked({
      status: JobStatus.INTERVIEWING,
      dateApplied: '2026-08-01',
      statusHistory: [{ status: JobStatus.INTERVIEWING, date: '2026-09-15T00:00:00+00:00' }],
    })];

    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', status: JobStatus.OFFER },
      statusDate: '2026-08-20',
    })], existing);

    expect(plan.verdict).toBe('identical');
    expect(plan.warnings.join(' ')).toContain('older than what is already recorded');
  });

  it('appends a note rather than replacing one', () => {
    const existing = [tracked({ notes: 'first note' })];

    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', notes: 'from the sheet' },
    })], existing);

    expect(plan.verdict).toBe('fill');
    expect(plan.payload.notes).toBe('first note\nfrom the sheet');
  });

  it('does not append a note it has already appended', () => {
    const existing = [tracked({ notes: 'first note\nfrom the sheet' })];

    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', notes: 'from the sheet' },
    })], existing);

    expect(plan.verdict).toBe('identical');
  });

  it('rejects a row with no company', () => {
    const [plan] = buildRowPlans([mapped({ input: { role: 'Engineer' } })], []);

    expect(plan.verdict).toBe('invalid');
    expect(plan.payload).toEqual({});
  });

  it('names a blank role rather than inventing a plausible one', () => {
    const [plan] = buildRowPlans([mapped({ input: { company: 'rhiaus (recruiter)' } })], []);

    expect(plan.verdict).toBe('create');
    expect(plan.payload.role).toBe('Unknown role');
    expect(plan.warnings.join(' ')).toContain('Unknown role');
  });

  it('does not create the same application twice from one sheet', () => {
    // Three applications to one company across a year, as the real sheet has.
    const plans = buildRowPlans([
      mapped({ rowNumber: 2, input: { company: 'Nexigen Digital', role: 'Software Engineer (PHP)' } }),
      mapped({ rowNumber: 3, input: { company: 'Nexigen Digital', role: 'Software Engineer (PHP)' } }),
    ], []);

    expect(plans.map(plan => plan.verdict)).toEqual(['create', 'identical']);
    expect(plans[1].reason).toContain('earlier row in this sheet');
  });

  it('creates every row when one company has several distinct roles', () => {
    const plans = buildRowPlans([
      mapped({ rowNumber: 2, input: { company: 'REA Group', role: 'Associate Software Engineer' } }),
      mapped({ rowNumber: 3, input: { company: 'REA Group', role: 'Software Engineer' } }),
    ], []);

    expect(plans.map(plan => plan.verdict)).toEqual(['create', 'create']);
  });

  it('fills the oldest of two rows already tracked under one key', () => {
    const first = tracked({ id: 10, location: '' });
    const second = tracked({ id: 11, location: '' });

    const [plan] = buildRowPlans([mapped({
      input: { company: 'Acme Corp', role: 'Backend Engineer', location: 'Sydney' },
    })], [first, second]);

    expect(plan.match?.id).toBe(10);
  });

  it('carries the row number and what the row is about, for the review table', () => {
    const [plan] = buildRowPlans([mapped({
      rowNumber: 19,
      input: { company: 'Dubber', role: 'Software Engineer' },
    })], []);

    expect(plan.rowNumber).toBe(19);
    expect(plan.company).toBe('Dubber');
    expect(plan.role).toBe('Software Engineer');
  });
});

describe('summarize', () => {
  it('counts each verdict', () => {
    const plans = buildRowPlans([
      mapped({ rowNumber: 2, input: { company: 'New Co', role: 'Engineer' } }),
      mapped({ rowNumber: 3, input: { company: 'Acme Corp', role: 'Backend Engineer', location: 'Sydney' } }),
      mapped({ rowNumber: 4, input: { company: 'Acme Corp', role: 'Backend Engineer' } }),
      mapped({ rowNumber: 5, input: { role: 'No company' } }),
    ], [tracked()]);

    expect(summarize(plans)).toEqual({ create: 1, fill: 1, identical: 1, invalid: 1 });
  });
});
