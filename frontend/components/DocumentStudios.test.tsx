// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CoverLetterStudio } from './CoverLetterStudio';
import { CVStudio } from './CVStudio';
import { JobApplication, JobStatus } from '../types';

/**
 * The CV and cover letter studios: generate a document, then refine it in
 * chat. The refine chat is a stored session opened over whatever the user is
 * looking at — a fresh draft, one saved earlier, or one edited by hand — so a
 * hand edit has to start a new session rather than refine the stale text.
 *
 * Stubbed at fetch, so the requests asserted are the ones the API receives.
 */

function application(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 5,
    company: 'Acme',
    role: 'Senior SWE',
    location: '',
    url: '',
    source: '',
    dateApplied: '',
    status: JobStatus.APPLIED,
    isImportant: false,
    notes: '',
    jobDescription: 'Maintain the billing platform.',
    coverLetter: '',
    tailoredCV: '',
    interviewStages: [],
    nextAction: '',
    nextActionDue: '',
    recruiterContact: null,
    takeHome: null,
    offer: null,
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Route = (body: Record<string, unknown>) => Response;

let requests: { url: string; body: Record<string, unknown> }[];

function stubApi(routes: Record<string, Route>) {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ url, body });
      const route = routes[url];
      if (!route) throw new Error(`Unexpected request to ${url}`);
      return route(body);
    }),
  );
}

const session = (id: number, kind: string) => () =>
  json({ session: { id, kind, context: {}, report: null, messages: [] } }, 201);

const reply = (text: string) => () => json({ text, message: {}, reply: {} });

const opened = (path: string) => requests.filter(r => r.url === path);

function refine(instruction: string) {
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\./), { target: { value: instruction } });
  fireEvent.click(screen.getByRole('button', { name: 'Refine' }));
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has no ResizeObserver; the A4 preview only uses it to rescale.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoverLetterStudio', () => {
  const renderStudio = (app = application()) =>
    render(
      <CoverLetterStudio
        app={app}
        baseCV="Ten years of backend work."
        coverLetterTemplate=""
        portfolioUrl=""
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('refines a letter saved earlier, opening the session over that letter', async () => {
    stubApi({
      '/api/ai/cover-letter/sessions': session(41, 'cover_letter'),
      '/api/ai/sessions/41/messages': reply('Shorter letter.'),
    });

    renderStudio(application({ coverLetter: 'Dear hiring team, ...' }));
    refine('Make it shorter');

    await screen.findByText('Shorter letter.');
    expect(opened('/api/ai/cover-letter/sessions')[0].body).toEqual({
      company: 'Acme',
      role: 'Senior SWE',
      jobDescription: 'Maintain the billing platform.',
      document: 'Dear hiring team, ...',
    });
    expect(opened('/api/ai/sessions/41/messages')[0].body).toEqual({ message: 'Make it shorter' });
  });

  it('keeps one session across refinements, and starts a new one after a hand edit', async () => {
    let next = 0;
    stubApi({
      '/api/ai/cover-letter/sessions': () => session(++next, 'cover_letter')(),
      '/api/ai/sessions/1/messages': reply('Revision one.'),
      '/api/ai/sessions/2/messages': reply('Revision two.'),
    });

    renderStudio(application({ coverLetter: 'Original.' }));
    refine('Tighten it');
    await screen.findByText('Revision one.');

    refine('Warmer tone');
    await waitFor(() => expect(opened('/api/ai/sessions/1/messages')).toHaveLength(2));
    expect(opened('/api/ai/cover-letter/sessions')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByPlaceholderText('Cover letter will appear here...'), {
      target: { value: 'Edited by hand.' },
    });
    refine('Fix the opening');

    await screen.findByText('Revision two.');
    expect(opened('/api/ai/cover-letter/sessions')).toHaveLength(2);
    expect(opened('/api/ai/cover-letter/sessions')[1].body.document).toBe('Edited by hand.');
  });

  it('says why when the account is not on Premium', async () => {
    stubApi({
      '/api/ai/cover-letter/generate': () =>
        json({ message: 'This feature requires a premium plan.', code: 'premium_required' }, 403),
    });

    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Tailored Cover Letter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Premium/);
  });
});

describe('CVStudio', () => {
  const renderStudio = (app = application()) =>
    render(
      <CVStudio
        app={app}
        baseCV="Ten years of backend work."
        cvTemplate=""
        portfolioUrl=""
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('generates a CV and then refines that draft', async () => {
    stubApi({
      '/api/ai/cv/generate': () => json({ text: 'JANE DOE — draft' }),
      '/api/ai/cv/sessions': session(7, 'cv'),
      '/api/ai/sessions/7/messages': reply('JANE DOE — shorter summary'),
    });

    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Tailored CV' }));
    await screen.findByText('JANE DOE — draft');

    refine('Shorten the summary');

    await screen.findByText('JANE DOE — shorter summary');
    expect(opened('/api/ai/cv/sessions')[0].body.document).toBe('JANE DOE — draft');
  });

  it('says so when the AI service is down, and keeps the draft', async () => {
    stubApi({
      '/api/ai/cv/sessions': () => json({ message: 'Unavailable.', code: 'ai_unavailable' }, 502),
    });

    renderStudio(application({ tailoredCV: 'JANE DOE — saved' }));
    refine('Shorten the summary');

    expect(await screen.findByRole('alert')).toHaveTextContent(/not answering/);
    expect(screen.getByText('JANE DOE — saved')).toBeInTheDocument();
  });
});
