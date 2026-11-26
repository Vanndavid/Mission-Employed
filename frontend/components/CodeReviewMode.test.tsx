import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../services/http';
import { CodeReviewResult, CodeReviewSnippet, NextSnippetResponse } from '../types/codeReview';

/**
 * The code review screen: comment on lines of a snippet as on a pull
 * request, submit, and see which planted issues the comments found. The
 * planted issues live on the server, so they can only appear after a review
 * comes back scored.
 */

const refreshUser = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: true, user: null, isAdmin: false, logout: vi.fn(), refreshUser }),
}));

const fetchNextSnippet = vi.fn();
const submitCodeReview = vi.fn();

vi.mock('../services/codeReviewClient', () => ({
  fetchNextSnippet: (...args: unknown[]) => fetchNextSnippet(...args),
  submitCodeReview: (...args: unknown[]) => submitCodeReview(...args),
}));

const { CodeReviewMode } = await import('./CodeReviewMode');

const code = Array.from({ length: 22 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');

const snippet: CodeReviewSnippet = {
  id: 7,
  language: 'javascript',
  title: 'One page of orders',
  difficulty: 'medium',
  prompt: 'Returns one page of the signed-in user’s orders.',
  code,
};

const other: CodeReviewSnippet = { ...snippet, id: 8, title: 'Search as you type' };

const served = (s: CodeReviewSnippet | null = snippet): NextSnippetResponse => ({
  snippet: s,
  reviewedBefore: false,
  total: 10,
  unreviewed: 9,
});

const INJECTION = 'The status is pasted into the SQL.';
const OFF_BY_ONE = 'Page 1 skips the newest orders.';

const scored: CodeReviewResult = {
  id: 41,
  snippet,
  score: 75,
  maxScore: 100,
  rubricVersion: 'cr-1',
  breakdown: {
    detection: { points: 53, max: 70, found: 1, total: 2, severityFound: 3, severityTotal: 4 },
    fixes: { points: 15, max: 20 },
    precision: { points: 7, max: 10, useful: 2, comments: 3 },
  },
  issues: [
    { id: 'sql-injection', lines: [3, 4], category: 'security', severity: 3, summary: INJECTION, fix: 'Bind it.', found: true, comments: [0], fixVerdict: 'yes' },
    { id: 'off-by-one', lines: [10, 10], category: 'bug', severity: 1, summary: OFF_BY_ONE, fix: 'Use page - 1.', found: false, comments: [], fixVerdict: null },
  ],
  bonus: [{ comment: 2, note: 'The handle does leak.' }],
  comments: [
    { line: 3, body: 'Injection here.', issues: ['sql-injection'], bonus: false, note: null },
    { line: 12, body: 'Unclear name.', issues: [], bonus: false, note: null },
    { line: 20, body: 'Handle never closed.', issues: [], bonus: true, note: 'The handle does leak.' },
  ],
  summary: null,
  takeaway: 'Check every value that reaches a query.',
  createdAt: '2026-11-26T10:00:00.000000Z',
};

function comment(line: number, text: string) {
  fireEvent.click(screen.getByRole('button', { name: `Comment on line ${line}` }));
  fireEvent.change(screen.getByRole('textbox', { name: `Comment on line ${line}` }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
}

async function loaded() {
  render(<CodeReviewMode />);
  await screen.findByText('One page of orders');
}

const row = (text: string) => screen.getByText(text).closest('[data-line]');

beforeEach(() => {
  vi.restoreAllMocks();
  refreshUser.mockReset();
  fetchNextSnippet.mockReset().mockResolvedValue(served());
  submitCodeReview.mockReset().mockResolvedValue(scored);
});

describe('CodeReviewMode', () => {
  it('serves a snippet with what it is meant to do, and no answers', async () => {
    await loaded();

    expect(fetchNextSnippet).toHaveBeenCalledWith({ language: null, difficulty: null }, expect.anything());
    expect(screen.getByText(snippet.prompt)).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Snippet under review' })).toBeTruthy();
    expect(screen.getByText('9 of 10 not reviewed yet')).toBeTruthy();
    expect(screen.queryByText(INJECTION)).toBeNull();
    // Nothing to submit until there is a comment.
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
  });

  it('comments on a line, then edits and deletes comments', async () => {
    await loaded();

    comment(3, 'Injection here.');
    expect(screen.getByText('Injection here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit comment on line 3' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment on line 3' }), { target: { value: 'SQL injection on the status.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(screen.getByText('SQL injection on the status.')).toBeTruthy();
    expect(screen.queryByText('Injection here.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete comment on line 3' }));
    expect(screen.queryByText('SQL injection on the status.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
  });

  it('submits the comments in line order and shows what they found', async () => {
    await loaded();

    comment(20, 'Handle never closed.');
    comment(3, 'Injection here.');
    comment(12, 'Unclear name.');
    fireEvent.change(screen.getByRole('textbox', { name: /Overall summary/ }), { target: { value: 'One real problem.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByText('75')).toBeTruthy();
    expect(submitCodeReview).toHaveBeenCalledWith(
      7,
      [
        { line: 3, body: 'Injection here.' },
        { line: 12, body: 'Unclear name.' },
        { line: 20, body: 'Handle never closed.' },
      ],
      'One real problem.',
    );

    // Each planted issue, found or missed, with its summary and fix.
    expect(screen.getByText('Found 1 of 2 planted issues')).toBeTruthy();
    expect(screen.getByText(INJECTION)).toBeTruthy();
    expect(screen.getByText(OFF_BY_ONE)).toBeTruthy();
    expect(screen.getByText('Use page - 1.')).toBeTruthy();
    expect(screen.getByText('Your fix works')).toBeTruthy();

    // Its lines are highlighted: green where found, amber where missed.
    expect(row('const line3 = 3;')?.className).toContain('emerald');
    expect(row('const line10 = 10;')?.className).toContain('amber');
    expect(row('const line12 = 12;')?.className).not.toMatch(/emerald|amber/);

    // The comments, marked up, and the score breakdown.
    expect(screen.getByText('Matched no planted issue')).toBeTruthy();
    expect(screen.getAllByText('The handle does leak.').length).toBeGreaterThan(0);
    expect(screen.getByText('53 / 70')).toBeTruthy();
    expect(screen.getByText('15 / 20')).toBeTruthy();
    expect(screen.getByText('7 / 10')).toBeTruthy();
    expect(screen.getByText('Check every value that reaches a query.')).toBeTruthy();
  });

  it('serves another snippet after a review, skipping this one', async () => {
    fetchNextSnippet.mockResolvedValueOnce(served()).mockResolvedValueOnce(served(other));
    await loaded();
    comment(3, 'Injection here.');
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next snippet' }));

    expect(await screen.findByText('Search as you type')).toBeTruthy();
    expect(fetchNextSnippet).toHaveBeenLastCalledWith({ language: null, difficulty: null, exclude: 7 }, expect.anything());
    expect(screen.queryByText('Injection here.')).toBeNull();
  });

  it('filters by language', async () => {
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Python' }));

    await waitFor(() =>
      expect(fetchNextSnippet).toHaveBeenLastCalledWith({ language: 'python', difficulty: null }, expect.anything()),
    );
    expect(screen.getByRole('button', { name: 'Python' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks before throwing away comments for another snippet', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await loaded();
    comment(3, 'Injection here.');

    fireEvent.click(screen.getByRole('button', { name: 'Another snippet' }));

    expect(confirm).toHaveBeenCalled();
    expect(fetchNextSnippet).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Injection here.')).toBeTruthy();
  });

  it('keeps the review and says why when the plan refuses it', async () => {
    submitCodeReview.mockRejectedValue(
      new ApiError(429, 'You have reached your Code review practice limit (30 per day). It resets Fri 27 Nov at 00:00 UTC.', 'quota_exceeded'),
    );
    await loaded();
    comment(3, 'Injection here.');
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached your Code review practice limit');
    expect(screen.getByText('Injection here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled();
  });

  it('says so when nothing matches the filter', async () => {
    fetchNextSnippet.mockResolvedValue(served(null));
    render(<CodeReviewMode />);

    expect(await screen.findByText(/No snippets match/)).toBeTruthy();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('explains a refusal to load', async () => {
    fetchNextSnippet.mockRejectedValue(new ApiError(403, 'Code review practice is a Premium feature.', 'premium_required'));
    render(<CodeReviewMode />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Code review practice is a Premium feature.');
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('shows the editor under the line it is for', async () => {
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 5' }));
    const figure = screen.getByRole('figure', { name: 'Snippet under review' });

    expect(within(figure).getByRole('textbox', { name: 'Comment on line 5' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(figure).queryByRole('textbox')).toBeNull();
  });
});
