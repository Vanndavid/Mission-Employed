// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import App from './App';

/**
 * The data layer end to end: a stored token, four loads on mount, and the
 * screens rendering what the API returned.
 *
 * The stubbed responses are verbatim captures from a running Laravel server,
 * envelope and all, so this fails if the client's idea of a payload drifts
 * from the real one.
 */

const USER = {
  id: 3,
  email: 'agent@example.com',
  role: 'user',
  plan: 'free',
  createdAt: '2026-08-29T15:40:44+00:00',
};

const APPLICATION = {
  id: 5,
  company: 'Acme Corp',
  role: 'Backend Engineer',
  location: '',
  url: 'https://example.com/job',
  dateApplied: '2026-08-30',
  status: 'Applied',
  notes: 'Pasted JD',
  jobDescription: 'Pasted JD',
  coverLetter: '',
  tailoredCV: '',
  interviewStages: [{ id: 7, type: 'technical', scheduledAt: '2026-09-05T09:00:00+00:00', notes: 'Round 1' }],
  nextAction: '',
  nextActionDue: '',
  recruiterContact: null,
  takeHome: null,
  offer: null,
  statusHistory: [{ status: 'Applied', date: '2026-08-29T15:40:47+00:00' }],
};

const PROFILE = {
  baseCV: 'My CV text',
  cvFileName: 'cv.txt',
  baseCoverLetter: '',
  portfolioUrl: 'https://github.com/me',
  coverLetterTemplate: '',
  cvTemplate: '',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: { url: string; token: string | null }[] = [];

function stubApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, token: headers.get('Authorization') });

    if (url.endsWith('/api/auth/me')) return json({ user: USER });
    if (url.endsWith('/api/applications')) return json({ data: [APPLICATION] });
    if (url.endsWith('/api/profile')) return json({ data: PROFILE });
    if (url.endsWith('/api/coding/attempts')) return json({ data: [] });
    if (url.endsWith('/api/behavioral-answers')) {
      return json({ data: [{ themeId: 'weakness', bullets: ['Cut deploy time 40%'] }] });
    }
    return json({ message: `unstubbed ${url}` }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // jsdom has no matchMedia; the theme loader asks it for the system palette.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));

  calls = [];
  localStorage.clear();
  window.history.pushState({}, '', '/applications');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the app against the API', () => {
  it('shows the sign-in screen when there is no token, without calling /auth/me', async () => {
    stubApi();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading account/i));
    expect(calls.some(call => call.url.includes('/auth/me'))).toBe(false);
  });

  it('loads the application list from the API on mount and again after a reload', async () => {
    stubApi();
    localStorage.setItem('mission_employed_token', '1|test-token');

    let first!: ReturnType<typeof render>;
    await act(async () => {
      first = render(<App />);
    });

    // The company shows up twice — the desktop table and the mobile card.
    await waitFor(() => expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0));

    // Every load carried the bearer token except the health check, which is
    // deliberately anonymous. Nothing was read from a localStorage state blob
    // — that key does not exist any more.
    const authenticated = calls.filter(call => !call.url.endsWith('/api/health'));
    expect(authenticated.every(call => call.token === 'Bearer 1|test-token')).toBe(true);
    expect(localStorage.getItem('mission_employed_state')).toBeNull();

    const loaded = calls.map(call => call.url.replace(/^.*\/api/, '/api'));
    expect(loaded).toContain('/api/auth/me');
    expect(loaded).toContain('/api/applications');
    expect(loaded).toContain('/api/profile');
    expect(loaded).toContain('/api/coding/attempts');
    expect(loaded).toContain('/api/behavioral-answers');

    // A hard refresh is a fresh mount with nothing but the token: the list has
    // to come back from the server, not from anything held locally.
    first.unmount();
    calls = [];

    await act(async () => {
      render(<App />);
    });
    await waitFor(() => expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0));
    expect(calls.some(call => call.url.endsWith('/api/applications'))).toBe(true);
  });

  it('signs the user out when the token is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'Unauthenticated.' }, 401)),
    );
    localStorage.setItem('mission_employed_token', '1|stale-token');

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => expect(localStorage.getItem('mission_employed_token')).toBeNull());
  });
});
