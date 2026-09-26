import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Which interview the mock screen opens, and what it shows. The Live
 * connection, microphone and speakers are the hook's business and are tested
 * there; here the hook is a stand-in the test drives directly.
 */

const createMockSession = vi.fn();
const fetchSession = vi.fn();
const generateMockReport = vi.fn();

vi.mock('../services/apiClient', () => ({
  createMockSession: (...args: unknown[]) => createMockSession(...args),
  fetchSession: (...args: unknown[]) => fetchSession(...args),
  generateMockReport: (...args: unknown[]) => generateMockReport(...args),
}));

type Live = ReturnType<typeof import('../hooks/useLiveInterview').useLiveInterview>;

let live: Live;
let rerenderLive: () => void = () => {};

vi.mock('../hooks/useLiveInterview', async () => {
  const React = await import('react');
  return {
    useLiveInterview: () => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      rerenderLive = force;
      return live;
    },
  };
});

/** Change what the hook reports and re-render, as the real one would. */
const setLive = (changes: Partial<Live>) =>
  act(() => {
    live = { ...live, ...changes };
    rerenderLive();
  });

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
  generateMockReport.mockReset().mockResolvedValue('**FINAL VERDICT**: Hire');
  live = {
    status: 'offline',
    error: null,
    draft: { answer: '', reply: '' },
    exchanges: [],
    levelRef: { current: 0 },
    begin: vi.fn().mockResolvedValue(undefined),
    startAnswer: vi.fn().mockResolvedValue(undefined),
    endAnswer: vi.fn(),
    disconnect: vi.fn(),
    settled: vi.fn().mockResolvedValue(undefined),
  };
  fetchSession.mockReset().mockResolvedValue({
    id: 3,
    messages: [{ role: 'model', content: 'An old generic question.' }],
  });
});

describe('MockTest', () => {
  it("opens the session with the application's company context", async () => {
    renderAt('/mock?appId=7');

    fireEvent.click(screen.getByRole('button', { name: 'Begin Session' }));

    // The new session's id goes straight to the Live hook for the greeting.
    await waitFor(() => expect(live.begin).toHaveBeenCalledWith(12));
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

  it('shows the exchange in progress as it is transcribed, then the stored one', async () => {
    renderAt('/mock?appId=7');
    fireEvent.click(screen.getByRole('button', { name: 'Begin Session' }));
    await waitFor(() => expect(live.begin).toHaveBeenCalled());

    setLive({ status: 'speaking', draft: { answer: '', reply: 'Welcome to Acme. Tell me' } });
    expect(screen.getByText('Welcome to Acme. Tell me')).toBeTruthy();

    setLive({
      status: 'ready',
      draft: { answer: '', reply: '' },
      exchanges: [{ answer: null, reply: 'Welcome to Acme. Tell me about a bug.' }],
    });
    expect(screen.getByText('Welcome to Acme. Tell me about a bug.')).toBeTruthy();
    expect(screen.queryByText('Welcome to Acme. Tell me')).toBeNull();
  });

  it('holds the record button while the interviewer has the floor', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 3, appId: 7 }));
    renderAt('/mock?appId=7');
    await screen.findByText('An old generic question.');

    for (const [status, label] of [
      ['connecting', 'CONNECTING...'],
      ['thinking', 'INTERVIEWER THINKING...'],
      ['speaking', 'INTERVIEWER SPEAKING...'],
    ] as const) {
      setLive({ status });
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true);
    }

    setLive({ status: 'ready' });
    fireEvent.click(screen.getByRole('button', { name: 'RECORD YOUR ANSWER' }));
    expect(live.startAnswer).toHaveBeenCalled();

    setLive({ status: 'recording' });
    fireEvent.click(screen.getByRole('button', { name: 'STOP RECORDING' }));
    expect(live.endAnswer).toHaveBeenCalled();
  });

  it('shows why the interviewer could not be reached', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 3, appId: 7 }));
    renderAt('/mock?appId=7');
    await screen.findByText('An old generic question.');

    setLive({ error: 'The AI service is unavailable right now.' });

    expect(screen.getByRole('alert').textContent).toBe('The AI service is unavailable right now.');
  });

  it('waits for every exchange to be saved before asking for the report', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 3, appId: 7 }));
    renderAt('/mock?appId=7');
    await screen.findByText('An old generic question.');
    setLive({ exchanges: [{ answer: 'I fixed a race.', reply: 'Which lock?' }] });

    let saved!: () => void;
    live.settled = vi.fn(() => new Promise<void>(resolve => (saved = resolve)));

    fireEvent.click(screen.getByRole('button', { name: 'END SESSION & GET REPORT' }));

    expect(live.disconnect).toHaveBeenCalled();
    await waitFor(() => expect(live.settled).toHaveBeenCalled());
    expect(generateMockReport).not.toHaveBeenCalled();

    await act(async () => saved());

    expect(generateMockReport).toHaveBeenCalledWith(3);
    expect(await screen.findByText('**FINAL VERDICT**: Hire')).toBeTruthy();
  });
});
