import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Which interview the mock screen opens. Recording needs a real microphone,
 * so what is covered here is the session wiring: starting one for the
 * application in the URL, and resuming only the interview that URL asked for.
 */

const createMockSession = vi.fn();
const conductMockTurn = vi.fn();
const fetchSession = vi.fn();

vi.mock('../services/apiClient', () => ({
  createMockSession: (...args: unknown[]) => createMockSession(...args),
  conductMockTurn: (...args: unknown[]) => conductMockTurn(...args),
  fetchSession: (...args: unknown[]) => fetchSession(...args),
  generateMockReport: vi.fn(),
  textToSpeech: vi.fn().mockResolvedValue(''),
}));

const { MockTest } = await import('./MockTest');

const KEY = 'mission_employed_mock_session';

const acme = {
  id: 7,
  company: 'Acme',
  role: 'Backend Engineer',
  jobDescription: 'Build the billing API.',
  notes: '',
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MockTest applications={[acme] as never} behavioralAnswers={[]} />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  createMockSession.mockReset().mockResolvedValue({ id: 12, messages: [] });
  conductMockTurn.mockReset().mockResolvedValue({ transcript: '', nextPrompt: 'Tell me about Acme.' });
  fetchSession.mockReset().mockResolvedValue({
    id: 3,
    messages: [{ role: 'model', content: 'An old generic question.' }],
  });
});

describe('MockTest', () => {
  it("opens the session with the application's company context", async () => {
    renderAt('/mock?appId=7');

    fireEvent.click(screen.getByRole('button', { name: 'Begin Session' }));

    expect(await screen.findByText('Tell me about Acme.')).toBeTruthy();
    expect(createMockSession).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'Acme', role: 'Backend Engineer', jobDescription: 'Build the billing API.' }),
    );
  });

  it('does not resume a generic interview in place of the application asked for', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 3, appId: null }));

    renderAt('/mock?appId=7');

    expect(await screen.findByRole('button', { name: 'Begin Session' })).toBeTruthy();
    expect(fetchSession).not.toHaveBeenCalled();
    expect(screen.queryByText('An old generic question.')).toBeNull();
  });

  it("resumes the application's own interview after a refresh", async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 3, appId: 7 }));

    renderAt('/mock?appId=7');

    expect(await screen.findByText('An old generic question.')).toBeTruthy();
    expect(fetchSession).toHaveBeenCalledWith(3);
  });

  it('still resumes a pointer stored before sessions were tied to an application', async () => {
    localStorage.setItem(KEY, '3');

    renderAt('/mock');

    expect(await screen.findByText('An old generic question.')).toBeTruthy();
  });

  it('stores the application alongside the session it starts', async () => {
    renderAt('/mock?appId=7');

    fireEvent.click(screen.getByRole('button', { name: 'Begin Session' }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ id: 12, appId: 7 }),
    );
  });
});
