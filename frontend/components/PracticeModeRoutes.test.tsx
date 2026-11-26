import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QuizCatalog } from '../types/practice';
import { CodeReviewSnippet } from '../types/codeReview';

/**
 * The coach's one-click starts: a link names the round or the focus in the
 * mode's address, and the mode starts it as soon as it has loaded, then the
 * address is tidied so a reload does not start it again.
 */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isPremium: true, isAdmin: false, hiddenTabs: [], refreshUser: vi.fn() }),
}));

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canUse: () => true, noteRefusal: vi.fn() }),
}));

const fetchQuizCatalog = vi.fn();
const fetchQuizProgress = vi.fn();
const startQuizRound = vi.fn();

vi.mock('../services/practiceClient', () => ({
  fetchQuizCatalog: (...args: unknown[]) => fetchQuizCatalog(...args),
  fetchQuizProgress: (...args: unknown[]) => fetchQuizProgress(...args),
  startQuizRound: (...args: unknown[]) => startQuizRound(...args),
  answerQuizQuestion: vi.fn(),
}));

const fetchNextSnippet = vi.fn();

vi.mock('../services/codeReviewClient', () => ({
  fetchNextSnippet: (...args: unknown[]) => fetchNextSnippet(...args),
  submitCodeReview: vi.fn(),
}));

const { QuizModeRoute, CodeReviewModeRoute } = await import('./PracticeModeRoutes');

const catalog: QuizCatalog = {
  languages: [
    { key: 'javascript', label: 'JavaScript', questionCount: 2, topics: [{ key: 'async', label: 'Promises & async', questionCount: 2 }] },
    { key: 'sql', label: 'SQL', questionCount: 1, topics: [{ key: 'joins', label: 'Joins', questionCount: 1 }] },
  ],
};

const snippet: CodeReviewSnippet = {
  id: 7,
  language: 'javascript',
  title: 'One page of orders',
  difficulty: 'medium',
  prompt: 'Returns a page of orders.',
  code: 'const a = 1;\nconst b = 2;',
};

function Where() {
  const location = useLocation();
  return <output aria-label="address">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/quiz" element={<QuizModeRoute />} />
        <Route path="/dashboard/code-review" element={<CodeReviewModeRoute />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const address = () => screen.getByRole('status', { name: 'address' }).textContent;

beforeEach(() => {
  fetchQuizCatalog.mockReset().mockResolvedValue(catalog);
  fetchQuizProgress.mockReset().mockResolvedValue({ language: 'sql', answered: 0, correct: 0, accuracy: null, openMistakes: 0, topics: [] });
  startQuizRound.mockReset().mockResolvedValue({
    language: 'sql',
    topic: 'joins',
    questions: [{ id: 3, topic: 'joins', difficulty: 'easy', prompt: 'Which join keeps every left row?', code: null, options: ['INNER', 'LEFT', 'CROSS', 'SELF'] }],
  });
  fetchNextSnippet.mockReset().mockResolvedValue({ snippet, reviewedBefore: false, total: 1, unreviewed: 1 });
});

describe('PracticeModeRoutes', () => {
  it('starts the quiz round a link asks for, in its language', async () => {
    renderAt('/dashboard/quiz?language=sql&topic=joins');

    expect(await screen.findByText('Which join keeps every left row?')).toBeTruthy();
    expect(startQuizRound).toHaveBeenCalledTimes(1);
    expect(startQuizRound).toHaveBeenCalledWith('sql', 'joins');
    await waitFor(() => expect(address()).toBe('/dashboard/quiz'));
  });

  it('opens the quiz menu as usual without one', async () => {
    renderAt('/dashboard/quiz');

    expect(await screen.findByRole('button', { name: 'Mixed round' })).toBeTruthy();
    expect(startQuizRound).not.toHaveBeenCalled();
  });

  it('focuses a code review on the category a link names, until it is cleared', async () => {
    renderAt('/dashboard/code-review?category=security');

    expect(await screen.findByText('One page of orders')).toBeTruthy();
    expect(fetchNextSnippet).toHaveBeenLastCalledWith({ language: null, difficulty: null, category: 'security' }, expect.anything());
    expect(screen.getByText('Focus: Security issues')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear the focus' }));

    await waitFor(() => expect(fetchNextSnippet).toHaveBeenLastCalledWith({ language: null, difficulty: null }, expect.anything()));
    expect(screen.queryByText('Focus: Security issues')).toBeNull();
    expect(address()).toBe('/dashboard/code-review');
  });
});
