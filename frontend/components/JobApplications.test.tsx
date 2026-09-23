import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

const renderPage = (onAdd = vi.fn(), applications: unknown[] = []) =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <JobApplications
          applications={applications as never}
          behavioralAnswers={[]}
          onAdd={onAdd}
          onUpdateStatus={vi.fn()}
          onUpdateApplication={vi.fn()}
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
    </MemoryRouter>,
  );

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

  it('shows why a rejected application was turned down', () => {
    const reasons = [
      'Which of the following statements best describes your right to work in Australia?',
      "How many years' experience do you have as a software engineer?",
    ];
    renderPage(vi.fn(), [tracked(1, { status: JobStatus.REJECTED, rejectionReasons: reasons })]);

    const table = screen.getByRole('table');
    expect(within(table).getByText('2 screening answers didn’t match')).toBeTruthy();

    // The full questions are in the drawer.
    fireEvent.click(within(table).getByText('Company 1'));
    const drawer = screen.getByRole('region', { name: 'Why it was rejected' });
    expect(within(drawer).getByText(reasons[0])).toBeTruthy();
    expect(within(drawer).getByText(reasons[1])).toBeTruthy();
  });
});
