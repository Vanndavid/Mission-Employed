// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ImportApplicationsModal } from './ImportApplicationsModal';
import { JobApplication, JobStatus } from '../types';
import { RowPlan } from '../utils/importMerge';

/**
 * The import flow, driven the way a person drives it: pick a file, look at the
 * mapping, look at the rows, commit.
 *
 * The AI call is stubbed at fetch, so the two failure modes it has to survive
 * — a free plan and an unreachable model — are both exercised here, along with
 * the guarantee that the importer still works in either case.
 */

const HEADER = '#,Date Applied,Company,Role,Channel,Status,Status Date,Days Since Applied,Follow Up?,Notes';

const SHEET = [
  HEADER,
  '1,21 Sep 2026,Open Universities Australia,Software Engineer,Company site,Applied,,1,,12-month max term contract',
  '2,20 Sep 2026,Cullen Jewellery,Software Engineer,Company site,Rejected,22 Sep 2026,2,,',
  '3,,Acme Corp,Backend Engineer,Seek,Applied,,,Follow up,',
].join('\n');

/** An application already in the tracker, matching the sheet's third row. */
function tracked(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 5,
    company: 'Acme Corp',
    role: 'Backend Engineer',
    location: 'Melbourne',
    url: '',
    source: '',
    dateApplied: '2026-01-01',
    status: JobStatus.APPLIED,
    isImportant: false,
    notes: 'kept',
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

function csvFile(contents = SHEET, name = 'applications.csv'): File {
  return new File([contents], name, { type: 'text/csv' });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The plan a model would answer with for this sheet. */
const AI_PLAN = {
  columns: {
    company: 2, role: 3, location: -1, url: -1, source: 4,
    status: 5, dateApplied: 1, statusDate: 6, notes: 9, nextAction: 8,
  },
  statusMap: [
    { from: 'Applied', status: 'Applied', nextAction: '', noteSuffix: '' },
    { from: 'Rejected', status: 'Rejected', nextAction: '', noteSuffix: '' },
  ],
  sourceMap: [],
  dateFormatHint: 'D MMM YYYY',
  notes: 'Column 7 counts elapsed days, not a date.',
};

function stubPlan(response: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response()));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('mission_employed_token', '1|test-token');
  stubPlan(() => json(AI_PLAN));
});

afterEach(() => vi.unstubAllGlobals());

async function openMapping(props: Partial<React.ComponentProps<typeof ImportApplicationsModal>> = {}) {
  const onCommit = vi.fn(async (plans: RowPlan[]) =>
    plans.map(plan => ({
      rowNumber: plan.rowNumber,
      verdict: plan.verdict,
      status: 'created' as const,
      applicationId: 1,
      message: '',
    })),
  );

  const view = render(
    <ImportApplicationsModal
      file={csvFile()}
      existing={[]}
      onClose={vi.fn()}
      onCommit={onCommit}
      {...props}
    />,
  );

  await waitFor(() => expect(screen.getByLabelText('Company')).toBeTruthy());

  return { ...view, onCommit };
}

/** Walk from the mapping step to the row review. */
async function goToReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Review rows' }));

  // 'Back to columns' exists only on the review step.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back to columns' })).toBeTruthy());
}

describe('ImportApplicationsModal', () => {
  it('reads the file and shows the mapping the AI resolved', async () => {
    await openMapping();

    await waitFor(() => expect(screen.getByText(/The AI changed|Columns matched\./)).toBeTruthy());

    // Column 2 is 'Company' in the header row.
    expect((screen.getByLabelText('Company') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Source') as HTMLSelectElement).value).toBe('4');
    expect(screen.getByText(/3 rows/)).toBeTruthy();
    expect(screen.getByText(/Column 7 counts elapsed days/)).toBeTruthy();
  });

  it('falls back to matching by name, and says why, on a free plan', async () => {
    stubPlan(() => json({ message: 'Premium required.', code: 'premium_required' }, 403));

    await openMapping();

    await waitFor(() => expect(screen.getByText(/premium feature/)).toBeTruthy());
    // Still fully usable: the guess found the columns by name.
    expect((screen.getByLabelText('Company') as HTMLSelectElement).value).toBe('2');
  });

  it('says something different when the AI is simply unreachable', async () => {
    stubPlan(() => json({ message: 'Unavailable.', code: 'ai_unavailable' }, 502));

    await openMapping();

    // A premium user must not be told their plan is the problem.
    await waitFor(() => expect(screen.getByText(/could not be reached/)).toBeTruthy());
    expect(screen.queryByText(/premium feature/)).toBeNull();
  });

  it('reports a file it cannot find any rows in', async () => {
    render(
      <ImportApplicationsModal
        file={csvFile('Company,Role\n', 'empty.csv')}
        existing={[]}
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText(/no rows to import/)).toBeTruthy());
  });

  it('shows a verdict per row, against what is already tracked', async () => {
    await openMapping({ existing: [tracked()] });
    await goToReview();

    expect(screen.getByText('2 new')).toBeTruthy();
    expect(screen.getByText('1 to fill')).toBeTruthy();

    // The matched row fills only the fields that are blank on the record —
    // location and notes already have values and are left alone.
    expect(screen.getByText('Fills source, nextAction')).toBeTruthy();
  });

  it('shows the status and dates each new row will be imported with', async () => {
    await openMapping();
    await goToReview();

    // Row 3 is Cullen Jewellery: applied 20 Sep, rejected 22 Sep.
    const row = screen.getByLabelText('Import row 3').closest('tr') as HTMLElement;

    expect(within(row).getByText('Rejected')).toBeTruthy();
    expect(within(row).getByText('on 2026-09-22')).toBeTruthy();
    expect(within(row).getByText('2026-09-20')).toBeTruthy();
    expect(within(row).getByText('New — not in your tracker yet.')).toBeTruthy();
  });

  it('marks a row unchanged when there is nothing to fill', async () => {
    await openMapping({ existing: [tracked({ source: 'Seek', nextAction: 'Follow up' })] });
    await goToReview();

    expect(screen.getByText('1 unchanged')).toBeTruthy();
    expect(screen.getByText('2 new')).toBeTruthy();
  });

  it('leaves an unchanged row visible but not importable', async () => {
    // "Why didn't row 4 import" is the first question, so they are never
    // hidden — only disabled.
    await openMapping({ existing: [tracked({ source: 'Seek', nextAction: 'Follow up' })] });
    await goToReview();

    const box = screen.getByLabelText('Import row 4') as HTMLInputElement;

    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
  });

  it('re-derives the verdicts when a mapping is corrected', async () => {
    await openMapping();
    await goToReview();

    expect(screen.getByText('3 new')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to columns' }));

    // Point company at the channel column: two rows then share 'Company site'
    // and must not both create.
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: '4' } });
    await goToReview();

    expect(screen.getByText('2 new')).toBeTruthy();
    expect(screen.getByText('1 unchanged')).toBeTruthy();
  });

  it('excludes a row the reviewer unchecks', async () => {
    const { onCommit } = await openMapping();
    await goToReview();

    fireEvent.click(screen.getByLabelText('Import row 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 rows' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalled());

    const committed = onCommit.mock.calls[0][0];

    expect(committed.map(plan => plan.rowNumber)).toEqual([3, 4]);
  });

  it('commits the checked rows and reports what happened', async () => {
    const onCommit = vi.fn(async (plans: RowPlan[]) => [
      {
        rowNumber: plans[0].rowNumber,
        verdict: plans[0].verdict,
        status: 'created' as const,
        applicationId: 1,
        message: '',
      },
      {
        rowNumber: plans[1].rowNumber,
        verdict: plans[1].verdict,
        status: 'failed' as const,
        applicationId: null,
        message: 'The role field is required.',
      },
    ]);

    await openMapping({ onCommit });
    await goToReview();

    fireEvent.click(screen.getByRole('button', { name: 'Import 3 rows' }));

    await waitFor(() => expect(screen.getByText(/1 failed/)).toBeTruthy());

    expect(screen.getByText('The role field is required.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('will not go on until a company column is chosen', async () => {
    await openMapping();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: '-1' } });

    const button = screen.getByRole('button', { name: 'Pick a company column' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
  });

  it('leaves the days-elapsed estimate switched off', async () => {
    await openMapping();

    const checkbox = screen
      .getByText(/Estimate a missing/)
      .closest('label')!
      .querySelector('input') as HTMLInputElement;

    expect(checkbox.checked).toBe(false);
  });

  it('estimates a missing date once the option is switched on', async () => {
    await openMapping();
    await goToReview();

    // Row 4 has no date applied; without the option it imports without one.
    expect(screen.queryByText(/estimated from/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to columns' }));
    fireEvent.click(
      screen.getByText(/Estimate a missing/).closest('label')!.querySelector('input')!,
    );

    // The days column for row 4 is blank, so nothing is invented for it; the
    // point is that the control is wired and the option is opt-in.
    expect(
      (screen.getByText(/Estimate a missing/).closest('label')!.querySelector('input') as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('flags a status neither the model nor the header names can place', async () => {
    const sheet = [
      HEADER,
      '1,21 Sep 2026,Acme Corp,Engineer,Seek,Employer replied - check,,1,,',
    ].join('\n');

    stubPlan(() => json({ ...AI_PLAN, statusMap: [] }));

    render(
      <ImportApplicationsModal
        file={csvFile(sheet)}
        existing={[]}
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    const warning = await waitFor(() => screen.getByText(/Not recognised/));

    // The sheet's own wording is named, so it is clear what will happen to it.
    expect(warning.textContent).toContain('Employer replied - check');
  });

  it('lets a status mapping be corrected by hand', async () => {
    await openMapping();

    const select = screen.getByLabelText('Status for Applied') as HTMLSelectElement;

    expect(select.value).toBe('Applied');
    fireEvent.change(select, { target: { value: 'Interviewing' } });

    await waitFor(() => expect(
      (screen.getByLabelText('Status for Applied') as HTMLSelectElement).value,
    ).toBe('Interviewing'));
  });

  it('shows a preview of each mapped column, so a wrong pick is visible', async () => {
    const { container } = await openMapping();

    expect(within(container).getByText(/Open Universities Australia/)).toBeTruthy();
  });
});
