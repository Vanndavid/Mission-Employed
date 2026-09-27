import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Going back over past mock interviews: the list, one interview's transcript
 * and report, and removing one.
 */

const listMockSessions = vi.fn();
const fetchSession = vi.fn();
const generateMockReport = vi.fn();
const deleteMockSession = vi.fn();

vi.mock('../services/apiClient', () => ({
  listMockSessions: (...args: unknown[]) => listMockSessions(...args),
  fetchSession: (...args: unknown[]) => fetchSession(...args),
  generateMockReport: (...args: unknown[]) => generateMockReport(...args),
  deleteMockSession: (...args: unknown[]) => deleteMockSession(...args),
}));

const { MockHistoryList, MockReview } = await import('./MockHistory');

const acme = {
  id: 5,
  context: { company: 'Acme', role: 'Backend Engineer' },
  messageCount: 6,
  hasReport: true,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:30:00.000Z',
};

const generic = {
  id: 4,
  context: null,
  messageCount: 2,
  hasReport: false,
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:05:00.000Z',
};

beforeEach(() => {
  listMockSessions.mockReset().mockResolvedValue([acme, generic]);
  fetchSession.mockReset().mockResolvedValue({
    id: 5,
    kind: 'mock',
    context: acme.context,
    report: { text: 'FINAL VERDICT: Hire', generatedAt: '2026-09-20T10:31:00.000Z' },
    messages: [
      { id: 1, role: 'model', content: 'Tell me about a bug.', sequence: 1 },
      { id: 2, role: 'user', content: 'I fixed a race.', sequence: 2 },
    ],
    createdAt: acme.createdAt,
    updatedAt: acme.updatedAt,
  });
  generateMockReport.mockReset().mockResolvedValue('FINAL VERDICT: Lean hire');
  deleteMockSession.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('MockHistoryList', () => {
  it('lists past interviews with their company and whether they have a report', async () => {
    render(<MockHistoryList onOpen={vi.fn()} />);

    const acmeRow = await screen.findByRole('button', { name: /Acme/ });
    expect(acmeRow.textContent).toContain('Backend Engineer');
    expect(acmeRow.textContent).toContain('Report');

    const genericRow = screen.getByRole('button', { name: /General interview/ });
    expect(genericRow.textContent).toContain('No report');
  });

  it('opens the interview that was picked', async () => {
    const onOpen = vi.fn();
    render(<MockHistoryList onOpen={onOpen} />);

    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));

    expect(onOpen).toHaveBeenCalledWith(5);
  });

  it('says so when there is nothing to review yet', async () => {
    listMockSessions.mockResolvedValue([]);
    render(<MockHistoryList onOpen={vi.fn()} />);

    expect(await screen.findByText(/No past interviews yet/)).toBeTruthy();
  });

  it('shows a failure to load instead of an empty history', async () => {
    listMockSessions.mockRejectedValue(new Error('boom'));
    render(<MockHistoryList onOpen={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not load/i);
  });
});

describe('MockReview', () => {
  it('shows the whole transcript and the stored report', async () => {
    render(<MockReview sessionId={5} onBack={vi.fn()} />);

    expect(await screen.findByText('Tell me about a bug.')).toBeTruthy();
    expect(screen.getByText('I fixed a race.')).toBeTruthy();
    expect(screen.getByText('FINAL VERDICT: Hire')).toBeTruthy();
    expect(fetchSession).toHaveBeenCalledWith(5);
    expect(generateMockReport).not.toHaveBeenCalled();
  });

  it('can write the report for an interview that was left without one', async () => {
    fetchSession.mockResolvedValue({
      id: 4,
      kind: 'mock',
      context: null,
      report: null,
      messages: [{ id: 3, role: 'model', content: 'Why this role?', sequence: 1 }],
      createdAt: generic.createdAt,
      updatedAt: generic.updatedAt,
    });
    render(<MockReview sessionId={4} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Generate report' }));

    expect(await screen.findByText('FINAL VERDICT: Lean hire')).toBeTruthy();
    expect(generateMockReport).toHaveBeenCalledWith(4);
  });

  it('deletes the interview after confirming, then goes back', async () => {
    const onBack = vi.fn();
    render(<MockReview sessionId={5} onBack={onBack} />);
    await screen.findByText('Tell me about a bug.');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(deleteMockSession).toHaveBeenCalledWith(5);
  });

  it('keeps the interview when the delete is not confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<MockReview sessionId={5} onBack={vi.fn()} />);
    await screen.findByText('Tell me about a bug.');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMockSession).not.toHaveBeenCalled();
  });

  it('goes back to the list', async () => {
    const onBack = vi.fn();
    render(<MockReview sessionId={5} onBack={onBack} />);
    await screen.findByText('Tell me about a bug.');

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));

    expect(onBack).toHaveBeenCalled();
  });

  it('labels who said what', async () => {
    render(<MockReview sessionId={5} onBack={vi.fn()} />);
    const question = await screen.findByText('Tell me about a bug.');

    expect(within(question.parentElement!).getByText(/Interviewer/)).toBeTruthy();
  });
});
