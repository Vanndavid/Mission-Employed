// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApplicationsProvider, useApplications } from './ApplicationsContext';
import { JobStatus } from '../types';

/**
 * The write path. Field edits arrive one keystroke at a time, so the thing
 * worth proving is that they turn into one coalesced PATCH rather than one per
 * character — and that the record the server answers with is what ends up in
 * state, ids included.
 */

const APPLICATION = {
  id: 5,
  company: 'Acme Corp',
  role: 'Backend Engineer',
  location: '',
  url: '',
  dateApplied: '2026-08-30',
  status: 'Applied',
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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let requests: { url: string; method: string; body: any }[] = [];

/**
 * Stands in for the tracker endpoints. It keeps the stage list, because the
 * real controller eager loads relations on every response — a PATCH answers
 * with the application's current stages, not an empty list.
 */
function stubApi() {
  let stages: unknown[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });

      const current = { ...APPLICATION, interviewStages: stages };

      if (method === 'GET') return json({ data: [current] });
      if (method === 'PATCH') return json({ data: { ...current, ...body } });
      if (method === 'POST' && url.endsWith('/stages')) {
        const stage = { id: 21, type: body.type, scheduledAt: '', notes: '' };
        stages = [...stages, stage];
        return json({ data: stage }, 201);
      }
      return json({ data: current }, 201);
    }),
  );
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ApplicationsProvider>{children}</ApplicationsProvider>;
}

beforeEach(() => {
  requests = [];
  localStorage.clear();
  localStorage.setItem('mission_employed_token', '1|test-token');
  stubApi();
});

afterEach(() => vi.unstubAllGlobals());

describe('ApplicationsProvider', () => {
  it('loads the list on mount', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.applications).toHaveLength(1);
    expect(result.current.applications[0].id).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it('coalesces rapid field edits into a single PATCH', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    requests = [];

    act(() => {
      result.current.updateApplication(5, { nextAction: 'S' });
      result.current.updateApplication(5, { nextAction: 'Se' });
      result.current.updateApplication(5, { nextAction: 'Send thank-you' });
    });

    // The edit shows immediately, before the server has been told.
    expect(result.current.applications[0].nextAction).toBe('Send thank-you');

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      url: '/api/applications/5',
      method: 'PATCH',
      body: { nextAction: 'Send thank-you' },
    });
  });

  it('sends a status change straight through, so the event log gets its row', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    requests = [];

    await act(async () => {
      await result.current.updateStatus(5, JobStatus.INTERVIEWING);
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ status: 'Interviewing' });
    expect(result.current.applications[0].status).toBe('Interviewing');
  });

  it('adds the stage the server returned rather than inventing an id', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addInterviewStage(5, { type: 'technical', scheduledAt: '' });
    });

    expect(result.current.applications[0].interviewStages).toEqual([
      { id: 21, type: 'technical', scheduledAt: '', notes: '' },
    ]);
  });

  it('surfaces a failed write instead of leaving the optimistic value in place', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        (init?.method ?? 'GET') === 'GET'
          ? json({ data: [APPLICATION] })
          : json({ message: 'The company field is required.' }, 422),
      ),
    );

    act(() => {
      result.current.updateApplication(5, { company: '' });
    });

    await waitFor(() => expect(result.current.error).toBe('The company field is required.'));
    // Reloaded from the server, so the rejected edit is gone.
    await waitFor(() => expect(result.current.applications[0].company).toBe('Acme Corp'));
  });
});
