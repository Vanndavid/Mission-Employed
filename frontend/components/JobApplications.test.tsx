import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const searchSeekJobs = vi.fn();

vi.mock('../services/seekClient', () => ({
  searchSeekJobs: (...args: unknown[]) => searchSeekJobs(...args),
}));

const { JobApplications } = await import('./JobApplications');
const { ToastProvider } = await import('./ToastProvider');

const { JobStatus } = await import('../types');

function tracked(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    company: `Company ${id}`,
    role: 'Engineer',
    location: '',
    url: '',
    source: '',
    dateApplied: `2026-09-${String(id).padStart(2, '0')}`,
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
    statusHistory: [],
    ...overrides,
  };
}

const pageWith = (applications: unknown[], onUpdateApplication = vi.fn(), onAdd = vi.fn()) => (
  <MemoryRouter>
    <ToastProvider>
      <JobApplications
        applications={applications as never}
        behavioralAnswers={[]}
        onAdd={onAdd}
        onUpdateStatus={vi.fn()}
        onUpdateApplication={onUpdateApplication}
        onAddInterviewStage={vi.fn()}
        onRemoveInterviewStage={vi.fn()}
        onDelete={vi.fn()}
        onCommitImport={vi.fn()}
        baseCV=""
        coverLetterTemplate=""
        cvTemplate=""
        portfolioUrl=""
      />
    </ToastProvider>
  </MemoryRouter>
);

const renderPage = (onAdd = vi.fn(), applications: unknown[] = [], onUpdateApplication = vi.fn()) =>
  render(pageWith(applications, onUpdateApplication, onAdd));

beforeEach(() => {
  searchSeekJobs.mockReset().mockResolvedValue({
    jobs: [],
    totalCount: 0,
    page: 1,
    pageSize: 6,
    keywords: 'software engineer',
    where: 'All Australia',
  });
});

describe('JobApplications', () => {
  it('opens on the tracker tab, with Seek behind its own tab', async () => {
    renderPage();

    expect(screen.getByRole('tab', { name: /My applications/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Search applications')).toBeTruthy();
    expect(screen.queryByLabelText('Seek keywords')).toBeNull();
    expect(searchSeekJobs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: /Find jobs on Seek/ }));

    await waitFor(() => expect(searchSeekJobs).toHaveBeenCalled());
    expect(screen.getByLabelText('Seek keywords')).toBeTruthy();
    expect(screen.queryByLabelText('Search applications')).toBeNull();
  });

  it('Add application opens a manual form that creates an application', () => {
    const onAdd = vi.fn();
    renderPage(onAdd);
    fireEvent.click(screen.getByRole('tab', { name: /Find jobs on Seek/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Add application' }));

    // It brings the tracker tab back, since that's where the form lives.
    expect(screen.getByRole('tab', { name: /My applications/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Backend Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save application' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ company: 'Acme', role: 'Backend Engineer' }));
    expect(screen.queryByLabelText('Company')).toBeNull();
  });

  it('shows five applications a page', () => {
    const apps = Array.from({ length: 12 }, (_, i) => tracked(i + 1));
    renderPage(vi.fn(), apps);

    const table = screen.getByRole('table');
    // Newest applied first: 12..8 on page one.
    expect(within(table).getByText('Company 12')).toBeTruthy();
    expect(within(table).getByText('Company 8')).toBeTruthy();
    expect(within(table).queryByText('Company 7')).toBeNull();
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(within(table).getByText('Company 7')).toBeTruthy();
    expect(within(table).queryByText('Company 12')).toBeNull();
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
  });

  it('shows when each status was last updated', () => {
    renderPage(vi.fn(), [
      tracked(1, {
        status: JobStatus.REJECTED,
        statusHistory: [{ status: JobStatus.REJECTED, date: '2026-09-22T00:00:00+00:00' }],
      }),
    ]);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('button', { name: /Updated/ })).toBeTruthy();
    expect(within(table).getByText(new Date('2026-09-22T00:00:00').toLocaleDateString())).toBeTruthy();
  });

  const REASONS = [
    'Which of the following statements best describes your right to work in Australia?',
    "How many years' experience do you have as a software engineer?",
  ];

  it('badges a rejected row with its flags and shows them on tap', () => {
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.REJECTED, rejectionReasons: REASONS })]);

    const table = screen.getByRole('table');
    const badge = within(table).getByRole('button', { name: /2 flags/ });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(badge);

    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText(REASONS[0])).toBeTruthy();
    expect(within(tooltip).getByText('Right to work')).toBeTruthy();
    expect(within(tooltip).getByText('Experience')).toBeTruthy();
    // Tapping the badge does not open the drawer as a row click would.
    expect(screen.queryByRole('region', { name: 'Rejection feedback' })).toBeNull();
  });

  it('only badges rows that are rejected', () => {
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.APPLIED, rejectionReasons: REASONS })]);

    expect(within(screen.getByRole('table')).queryByRole('button', { name: /flags?/ })).toBeNull();
  });

  it('lists rejection feedback in the drawer with a category for each', () => {
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.REJECTED, rejectionReasons: REASONS })]);

    fireEvent.click(within(screen.getByRole('table')).getByText('Company 1'));

    const section = screen.getByRole('region', { name: 'Rejection feedback' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(REASONS[0])).toBeTruthy();
    expect(within(items[0]).getByText('Right to work')).toBeTruthy();
    expect(within(items[1]).getByText('Experience')).toBeTruthy();
    expect(within(section).getByText(/From SEEK screening questions\. Only part of how the employer judged/)).toBeTruthy();
  });

  it('hides the feedback section when there is none to show', () => {
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.APPLIED })]);

    fireEvent.click(within(screen.getByRole('table')).getByText('Company 1'));

    expect(screen.queryByRole('region', { name: 'Rejection feedback' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add rejection feedback/ })).toBeNull();
  });

  it('adds, edits and removes reasons through the update path', () => {
    const onUpdate = vi.fn();
    const { rerender } = renderPage(vi.fn(), [tracked(1, { status: JobStatus.REJECTED })], onUpdate);
    fireEvent.click(within(screen.getByRole('table')).getByText('Company 1'));

    // Add the first one to a rejection that had none.
    fireEvent.click(screen.getByRole('button', { name: '+ Add rejection feedback' }));
    fireEvent.change(screen.getByLabelText('New reason'), { target: { value: '  Do you require visa sponsorship? ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onUpdate).toHaveBeenLastCalledWith(1, { rejectionReasons: ['Do you require visa sponsorship?'] });

    // The parent applies the patch; render what it would hand back.
    rerender(pageWith([tracked(1, { status: JobStatus.REJECTED, rejectionReasons: REASONS })], onUpdate));

    fireEvent.click(screen.getByRole('button', { name: `Edit reason: ${REASONS[1]}` }));
    fireEvent.change(screen.getByLabelText('Edit reason'), { target: { value: 'Years with React' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenLastCalledWith(1, { rejectionReasons: [REASONS[0], 'Years with React'] });

    fireEvent.click(screen.getByRole('button', { name: `Remove reason: ${REASONS[0]}` }));
    expect(onUpdate).toHaveBeenLastCalledWith(1, { rejectionReasons: [REASONS[1]] });
  });

  it('has an Insights tab beside the tracker', () => {
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.REJECTED, rejectionReasons: REASONS })]);

    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));

    expect(screen.getByRole('heading', { name: 'Why SEEK screened me out' })).toBeTruthy();
    expect(screen.queryByLabelText('Search applications')).toBeNull();
  });
});
