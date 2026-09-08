// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeekJob } from '../utils/seekJobs';

const searchSeekJobs = vi.fn();

vi.mock('../services/seekClient', () => ({
  searchSeekJobs: (...args: unknown[]) => searchSeekJobs(...args),
}));

const { SeekJobs } = await import('./SeekJobs');

const JOB: SeekJob = {
  id: '94488368',
  title: 'Software Engineer',
  company: 'Energetica',
  location: 'Melbourne VIC',
  url: 'https://www.seek.com.au/job/94488368',
  salary: '$105,000 – $135,000 per year',
  teaser: 'End-to-end software platform.',
  bulletPoints: ['career development'],
  workTypes: ['Full time'],
  workArrangement: 'Hybrid',
  listedAt: '2026-09-08T05:10:53Z',
  listedAgo: '7h ago',
  classification: 'ICT',
  subclassification: 'Engineering - Software',
};

beforeEach(() => {
  searchSeekJobs.mockReset().mockResolvedValue({
    jobs: [JOB],
    totalCount: 1,
    page: 1,
    pageSize: 20,
    keywords: 'software engineer',
    where: 'All Australia',
  });
});

afterEach(cleanup);

describe('SeekJobs', () => {
  it('loads Seek listings on mount with the default software-engineer search', async () => {
    render(<SeekJobs trackedUrls={[]} onSave={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Energetica')).toBeTruthy());
    expect(searchSeekJobs).toHaveBeenCalled();
    const [params] = searchSeekJobs.mock.calls[0];
    expect(params.keywords).toBe('software engineer');
    expect(params.where).toBe('All Australia');
    expect(params.page).toBe(1);
    expect(screen.getByText('Software Engineer')).toBeTruthy();
    expect(screen.getByText('End-to-end software platform.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View on Seek' }).getAttribute('href')).toBe(JOB.url);
  });

  it('saves a listing through onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SeekJobs trackedUrls={[]} onSave={onSave} />);

    await waitFor(() => expect(screen.getByText('Energetica')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      company: 'Energetica',
      role: 'Software Engineer',
      url: JOB.url,
      status: 'Saved',
    });
  });

  it('marks a listing that is already in the tracker as Saved', async () => {
    render(<SeekJobs trackedUrls={[JOB.url]} onSave={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Energetica')).toBeTruthy());
    const saved = screen.getByRole('button', { name: 'Saved' });
    expect((saved as HTMLButtonElement).disabled).toBe(true);
  });

  it('searches again when the form is submitted', async () => {
    render(<SeekJobs trackedUrls={[]} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Energetica')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Seek keywords'), {
      target: { value: 'backend engineer' },
    });
    fireEvent.change(screen.getByLabelText('Seek location'), {
      target: { value: 'Sydney NSW' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Seek' }));

    await waitFor(() =>
      expect(searchSeekJobs.mock.calls.some(call => call[0].keywords === 'backend engineer')).toBe(
        true,
      ),
    );
    const last = searchSeekJobs.mock.calls.at(-1)?.[0];
    expect(last.where).toBe('Sydney NSW');
    expect(last.page).toBe(1);
  });

  it('shows a contained error when Seek is down', async () => {
    searchSeekJobs.mockRejectedValueOnce(new Error('Seek is unavailable right now. Please try again in a moment.'));
    render(<SeekJobs trackedUrls={[]} onSave={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Seek is unavailable/i),
    );
  });
});
