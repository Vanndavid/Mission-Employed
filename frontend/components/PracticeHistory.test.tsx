import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../services/http';
import { PracticeAttemptPage, PracticeAttemptSummary } from '../types/practiceHistory';
import { progressFixture } from '../utils/practiceProgress.fixture';

/**
 * Practice history: how each mode has gone over the last 30 days, the coach,
 * and every scored attempt newest first, each linking to its own page.
 */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false, hiddenTabs: [] }),
}));

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canUse: () => true }),
}));

const fetchPracticeProgress = vi.fn();
const fetchPracticeAttempts = vi.fn();

vi.mock('../services/practiceHistoryClient', () => ({
  fetchPracticeProgress: (...args: unknown[]) => fetchPracticeProgress(...args),
  fetchPracticeAttempts: (...args: unknown[]) => fetchPracticeAttempts(...args),
}));

const { PracticeHistory } = await import('./PracticeHistory');

const attempt = (id: number, extra: Partial<PracticeAttemptSummary> = {}): PracticeAttemptSummary => ({
  id,
  kind: 'quiz',
  title: `Question ${id}`,
  language: 'javascript',
  topic: 'async',
  topicLabel: 'Promises & async',
  difficulty: 'easy',
  score: 1,
  maxScore: 1,
  correct: true,
  createdAt: '2026-11-25T12:00:00.000000Z',
  ...extra,
});

const page = (attempts: PracticeAttemptSummary[], meta: Partial<PracticeAttemptPage['meta']> = {}): PracticeAttemptPage => ({
  attempts,
  meta: { page: 1, perPage: 20, total: attempts.length, lastPage: 1, ...meta },
});

const renderHistory = () =>
  render(
    <MemoryRouter>
      <PracticeHistory />
    </MemoryRouter>,
  );

beforeEach(() => {
  fetchPracticeProgress.mockReset().mockResolvedValue(progressFixture());
  fetchPracticeAttempts.mockReset().mockResolvedValue(
    page([
      attempt(3, { kind: 'code_review', title: 'One page of orders', topic: null, topicLabel: null, difficulty: 'medium', score: 62, maxScore: 100, correct: null }),
      attempt(2, { correct: false, score: 0 }),
    ]),
  );
});

describe('PracticeHistory', () => {
  it('shows each mode over the last 30 days', async () => {
    renderHistory();

    const summary = await screen.findByRole('list', { name: 'Last 30 days' });
    const [quiz, review, design] = within(summary).getAllByRole('listitem');
    expect(quiz.textContent).toContain('4 answers');
    expect(quiz.textContent).toContain('25%');
    expect(review.textContent).toContain('1 review');
    expect(review.textContent).toContain('53%');
    expect(design.textContent).toContain('None yet');
  });

  it('lists the attempts newest first, each linking to its page', async () => {
    renderHistory();

    const rows = within(await screen.findByRole('list', { name: 'Attempts' })).getAllByRole('link');
    expect(rows.map(r => r.getAttribute('href'))).toEqual(['/dashboard/history/3', '/dashboard/history/2']);
    expect(rows[0].textContent).toContain('One page of orders');
    expect(rows[0].textContent).toContain('Code review · JavaScript · medium');
    expect(rows[0].textContent).toContain('62 / 100');
    expect(rows[1].textContent).toContain('Wrong');
    expect(screen.getByRole('heading', { name: /Practise next/ })).toBeTruthy();
  });

  it('filters by mode and moves between pages', async () => {
    fetchPracticeAttempts.mockResolvedValue(page([attempt(5)], { total: 25, lastPage: 2 }));
    renderHistory();
    await screen.findByText('Question 5');
    expect(fetchPracticeAttempts).toHaveBeenLastCalledWith({ kind: null, page: 1 }, expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    await waitFor(() => expect(fetchPracticeAttempts).toHaveBeenLastCalledWith({ kind: null, page: 2 }, expect.anything()));

    fireEvent.click(screen.getByRole('button', { name: 'Code review' }));
    await waitFor(() => expect(fetchPracticeAttempts).toHaveBeenLastCalledWith({ kind: 'code_review', page: 1 }, expect.anything()));
    expect(screen.getByRole('button', { name: 'Code review' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says when there is nothing yet', async () => {
    fetchPracticeAttempts.mockResolvedValue(page([]));
    renderHistory();

    expect(await screen.findByText(/No scored attempts yet/)).toBeTruthy();
  });

  it('says when the history cannot be loaded', async () => {
    fetchPracticeAttempts.mockRejectedValue(new ApiError(500, 'Server Error'));
    renderHistory();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
