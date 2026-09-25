import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JobApplication, JobStatus } from '../types';
import { RejectionInsights } from './RejectionInsights';

function app(id: number, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    company: `Company ${id}`,
    role: `Role ${id}`,
    url: '',
    source: '',
    dateApplied: '2026-09-01',
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

const rejected = (id: number, date: string, reasons: string[] = []) =>
  app(id, {
    status: JobStatus.REJECTED,
    dateApplied: date,
    statusHistory: [{ status: JobStatus.REJECTED, date: `${date}T09:00:00+00:00` }],
    rejectionReasons: reasons,
  });

const renderInsights = (applications: JobApplication[]) =>
  render(
    <MemoryRouter>
      <RejectionInsights applications={applications} />
    </MemoryRouter>,
  );

const tile = (label: string) => screen.getByText(label).parentElement!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25));
});

afterEach(() => vi.useRealTimers());

describe('RejectionInsights', () => {
  const applications = [
    app(1, { dateApplied: '2026-09-20' }),
    rejected(2, '2026-09-10', [
      'Which of the following statements best describes your right to work in Australia?',
      "How many years' experience do you have as a full stack developer?",
    ]),
    rejected(3, '2026-09-05', ['How many years of AI Engineering experience do you have?']),
    rejected(4, '2026-05-15', ['Do you require visa sponsorship?']),
    rejected(5, '2026-07-02'),
  ];

  it('shows the summary numbers', () => {
    renderInsights(applications);

    expect(within(tile('Applications')).getByText('5')).toBeTruthy();
    expect(within(tile('Rejected')).getByText('4')).toBeTruthy();
    expect(within(tile('Rejected with SEEK feedback')).getByText('3')).toBeTruthy();
    expect(within(tile('Rejected with SEEK feedback')).getByText('75% of rejected')).toBeTruthy();
  });

  it('charts each category with its count and share, most first and ties by name', () => {
    renderInsights(applications);

    const chart = screen.getByRole('region', { name: 'Why SEEK screened me out' });
    const bars = within(chart).getAllByRole('button');
    expect(bars.map(b => b.textContent)).toEqual(['Experience2 · 67%', 'Right to work2 · 67%']);
  });

  it('lists the matching applications when a bar is selected, each linking to it', () => {
    renderInsights(applications);

    fireEvent.click(screen.getByRole('button', { name: /^Experience/ }));

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/applications?prep=2');
    expect(within(links[0]).getByText('Company 2')).toBeTruthy();
    expect(within(links[0]).getByText('Role 2')).toBeTruthy();
    expect(
      within(links[0]).getByText("How many years' experience do you have as a full stack developer?"),
    ).toBeTruthy();
    expect(within(links[1]).getByText('Company 3')).toBeTruthy();
  });

  it('applies the date range to everything', () => {
    renderInsights(applications);

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    expect(within(tile('Applications')).getByText('3')).toBeTruthy();
    expect(within(tile('Rejected')).getByText('2')).toBeTruthy();
    const chart = screen.getByRole('region', { name: 'Why SEEK screened me out' });
    expect(within(chart).getAllByRole('button').map(b => b.textContent)).toEqual([
      'Experience2 · 100%',
      'Right to work1 · 50%',
    ]);
  });

  it('stacks rejections per month by whether they have feedback', () => {
    renderInsights(applications);

    const table = screen.getByRole('table', { name: 'Rejected applications per month' });
    const rows = within(table).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toHaveLength(5); // May to September, empty months included
    expect(rows[0]).toMatch(/10$/);
    expect(rows[2]).toMatch(/01$/);
    expect(rows[4]).toMatch(/20$/);
  });

  it('shows a message instead of empty charts when nothing has feedback', () => {
    renderInsights([app(1), rejected(2, '2026-09-01')]);

    expect(screen.getByText(/No rejection feedback yet/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Why SEEK screened me out' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
