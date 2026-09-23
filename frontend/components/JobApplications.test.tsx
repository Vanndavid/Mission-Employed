import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const searchSeekJobs = vi.fn();

vi.mock('../services/seekClient', () => ({
  searchSeekJobs: (...args: unknown[]) => searchSeekJobs(...args),
}));

const { JobApplications } = await import('./JobApplications');
const { ToastProvider } = await import('./ToastProvider');

const renderPage = (onAdd = vi.fn()) =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <JobApplications
          applications={[]}
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
});
