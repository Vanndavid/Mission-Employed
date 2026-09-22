// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApplicationsProvider, useApplications } from './ApplicationsContext';
import { JobStatus } from '../types';
import { RowPlan } from '../utils/importMerge';

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
  source: '',
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

describe('commitImport', () => {
  /** A reviewed row plan, as the import modal hands them over. */
  function plan(overrides: Partial<RowPlan> = {}): RowPlan {
    return {
      rowNumber: 2,
      verdict: 'create',
      match: null,
      payload: { company: 'Globex', role: 'Developer' },
      fills: [],
      statusDate: '',
      warnings: [],
      reason: 'Not tracked yet.',
      company: 'Globex',
      role: 'Developer',
      ...overrides,
    } as RowPlan;
  }

  it('creates new rows and patches matched ones', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    requests = [];

    let outcomes: Awaited<ReturnType<typeof result.current.commitImport>> = [];

    await act(async () => {
      outcomes = await result.current.commitImport([
        plan(),
        plan({
          rowNumber: 3,
          verdict: 'fill',
          match: APPLICATION as any,
          payload: { location: 'Sydney' },
          fills: ['location'],
        }),
      ]);
    });

    const writes = requests.filter(request => request.method !== 'GET');

    expect(writes).toHaveLength(2);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].url).toContain('/api/applications');
    expect(writes[1].method).toBe('PATCH');
    expect(writes[1].url).toContain('/api/applications/5');
    // Only the fields being filled go over, so nothing else is touched.
    expect(writes[1].body).toEqual({ location: 'Sydney' });

    expect(outcomes.map(outcome => outcome.status)).toEqual(['created', 'filled']);
  });

  it('sends nothing at all for unchanged or invalid rows', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    requests = [];

    let outcomes: Awaited<ReturnType<typeof result.current.commitImport>> = [];

    await act(async () => {
      outcomes = await result.current.commitImport([
        plan({ verdict: 'identical', payload: {}, reason: 'Already tracked as #5.' }),
        plan({ rowNumber: 3, verdict: 'invalid', payload: {}, reason: 'No company.' }),
      ]);
    });

    // Re-importing an unchanged sheet must cost zero requests.
    expect(requests.filter(request => request.method !== 'GET')).toHaveLength(0);
    expect(outcomes.map(outcome => outcome.status)).toEqual(['skipped', 'skipped']);
    expect(outcomes[0].message).toBe('Already tracked as #5.');
  });

  it('keeps going after a row fails, and says why', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let seen = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'GET') return json({ data: [APPLICATION] });

        seen += 1;

        // The first write fails on validation, the second must still run.
        return seen === 1
          ? json({ message: 'Unprocessable.', errors: { role: ['The role field is required.'] } }, 422)
          : json({ data: { ...APPLICATION, id: 9 } }, 201);
      }),
    );

    let outcomes: Awaited<ReturnType<typeof result.current.commitImport>> = [];

    await act(async () => {
      outcomes = await result.current.commitImport([plan(), plan({ rowNumber: 3 })]);
    });

    expect(outcomes[0].status).toBe('failed');
    // The field error itself, not a generic sentence.
    expect(outcomes[0].message).toBe('The role field is required.');
    expect(outcomes[0].rowNumber).toBe(2);
    expect(outcomes[1].status).toBe('created');
    // The modal reports per row, so the global banner stays clear.
    expect(result.current.error).toBeNull();
  });

  it('puts created rows into state', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.commitImport([plan(), plan({ rowNumber: 3 })]);
    });

    expect(result.current.applications).toHaveLength(3);
  });
});
