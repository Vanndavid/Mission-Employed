import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../services/http';
import { PracticeAttemptDetail } from '../types/practiceHistory';
import { SystemDesignRubric } from '../types/systemDesign';

/**
 * A practice attempt's page in the history: that mode's own result screen,
 * drawn again from what the server stored, without the buttons that only
 * make sense straight after scoring.
 */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isPremium: false, isAdmin: false, hiddenTabs: [], refreshUser: vi.fn() }),
}));

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canUse: () => false, noteRefusal: vi.fn() }),
}));

vi.mock('../services/questionBankClient', () => ({ reportQuestion: vi.fn() }));

const fetchPracticeAttempt = vi.fn();

vi.mock('../services/practiceHistoryClient', () => ({
  fetchPracticeAttempt: (...args: unknown[]) => fetchPracticeAttempt(...args),
}));

const { PracticeAttemptPage } = await import('./PracticeAttemptPage');

const base = { id: 41, score: 0, maxScore: 1, correct: false, rubricVersion: null, createdAt: '2026-11-20T12:00:00.000000Z' };

type QuizDetail = Extract<PracticeAttemptDetail, { kind: 'quiz' }>;

const QUIZ: QuizDetail = {
  ...base,
  kind: 'quiz',
  result: {
    question: {
      id: 11,
      language: 'javascript',
      topic: 'scope',
      topicLabel: 'Scope, hoisting & closures',
      difficulty: 'easy',
      prompt: 'What does this print?',
      code: 'console.log(x);\nvar x = 1;',
      options: ['0', '1', 'undefined', 'ReferenceError'],
      published: true,
    },
    choice: 'ReferenceError',
    correct: false,
    answer: 'undefined',
    explanation: 'var is hoisted and starts as undefined.',
  },
};

const REVIEW: PracticeAttemptDetail = {
  ...base,
  kind: 'code_review',
  score: 75,
  maxScore: 100,
  correct: null,
  rubricVersion: 'cr-1',
  result: {
    id: 41,
    snippet: { id: 7, language: 'javascript', title: 'One page of orders', difficulty: 'medium', prompt: 'Returns a page of orders.', code: 'const a = 1;\nconst b = 2;\nconst c = 3;' },
    score: 75,
    maxScore: 100,
    rubricVersion: 'cr-1',
    breakdown: {
      detection: { points: 53, max: 70, found: 1, total: 2, severityFound: 3, severityTotal: 4 },
      fixes: { points: 15, max: 20 },
      precision: { points: 7, max: 10, useful: 1, comments: 1 },
    },
    issues: [
      { id: 'sql-injection', lines: [2, 2], category: 'security', severity: 3, summary: 'The status is pasted into the SQL.', fix: 'Bind it.', found: true, comments: [0], fixVerdict: 'yes' },
      { id: 'off-by-one', lines: [3, 3], category: 'bug', severity: 1, summary: 'Page 1 skips the newest orders.', fix: 'Use page - 1.', found: false, comments: [], fixVerdict: null },
    ],
    bonus: [],
    comments: [{ line: 2, body: 'Injection here.', issues: ['sql-injection'], bonus: false, note: null }],
    summary: null,
    takeaway: 'Check every value that reaches a query.',
    createdAt: '2026-11-20T12:00:00.000000Z',
  },
};

const descriptors = [0, 1, 2, 3, 4].map(n => `descriptor ${n}`);

const RUBRIC: SystemDesignRubric = {
  version: 'sd-1',
  traitMax: 4,
  maxScore: 100,
  minWords: 15,
  sections: [
    { key: 'requirements', label: 'Requirements', hint: 'What it must do.' },
    { key: 'estimates', label: 'Estimates', hint: 'Traffic.' },
  ],
  traits: [{ key: 'requirements', label: 'Requirements and scope', weight: 12, sections: ['requirements'], descriptors }],
};

const DESIGN: PracticeAttemptDetail = {
  ...base,
  kind: 'system_design',
  score: 12,
  maxScore: 100,
  correct: null,
  rubricVersion: 'sd-1',
  result: {
    scenario: { id: 9, title: 'URL shortener', difficulty: 'easy', prompt: 'Design a URL shortener for 100 million new links a month.' },
    sections: {
      requirements: 'Short links that redirect fast, with p99 under 50 ms.',
      estimates: '',
      api: '',
      data_model: '',
      high_level: '',
      deep_dive: '',
      tradeoffs: '',
    },
    report: {
      attemptId: 41,
      questionId: 9,
      rubricVersion: 'sd-1',
      score: 12,
      maxScore: 100,
      traits: [
        {
          key: 'requirements',
          label: 'Requirements and scope',
          score: 4,
          max: 4,
          points: 12,
          maxPoints: 12,
          gated: false,
          words: 20,
          descriptor: 'descriptor 4',
          evidence: 'p99 under 50 ms',
          improvement: 'Say what is out of scope.',
          keyPoints: { covered: ['Separates creating from following'], missed: ['Puts a number on latency'] },
        },
      ],
      explanation: 'A read-heavy key-value problem.',
    },
    rubric: RUBRIC,
  },
};

function renderAt(path = '/dashboard/history/41') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/history/:id" element={<PracticeAttemptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchPracticeAttempt.mockReset();
});

describe('PracticeAttemptPage', () => {
  it('reads the attempt the address names', async () => {
    fetchPracticeAttempt.mockResolvedValue(QUIZ);
    renderAt('/dashboard/history/41');

    await screen.findByText('What does this print?');
    expect(fetchPracticeAttempt).toHaveBeenCalledWith(41, expect.anything());
    expect(screen.getByRole('link', { name: '← Practice history' }).getAttribute('href')).toBe('/dashboard/history');
  });

  it('draws a quiz answer: the options marked, the verdict and why', async () => {
    fetchPracticeAttempt.mockResolvedValue(QUIZ);
    renderAt();

    const options = within(await screen.findByRole('list', { name: 'Options' })).getAllByRole('listitem');
    expect(options.map(o => o.textContent)).toEqual(['A0', 'B1', 'Cundefined✓ Answer', 'DReferenceError✗ Your answer']);
    expect(screen.getByText('Not quite. The answer is “undefined”.')).toBeTruthy();
    expect(screen.getByText('var is hoisted and starts as undefined.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report this question' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Practise this topic' }).getAttribute('href')).toBe(
      '/dashboard/quiz?language=javascript&topic=scope',
    );
  });

  it('says when a quiz question has left the bank, and offers no report', async () => {
    const unpublished = structuredClone(QUIZ);
    unpublished.result.question.published = false;
    fetchPracticeAttempt.mockResolvedValue(unpublished);
    renderAt();

    expect(await screen.findByText(/since been taken out of the question bank/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report this question' })).toBeNull();
  });

  it('draws a code review as it was scored, without the after-scoring buttons', async () => {
    fetchPracticeAttempt.mockResolvedValue(REVIEW);
    renderAt();

    expect(await screen.findByText('One page of orders')).toBeTruthy();
    expect(screen.getByText('Found 1 of 2 planted issues')).toBeTruthy();
    expect(screen.getByText('The status is pasted into the SQL.')).toBeTruthy();
    expect(screen.getByText('Page 1 skips the newest orders.')).toBeTruthy();
    expect(screen.getByText('Check every value that reaches a query.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next snippet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review this one again' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Review another snippet' }).getAttribute('href')).toBe('/dashboard/code-review');
  });

  it('draws a system design report with the answer that was scored', async () => {
    fetchPracticeAttempt.mockResolvedValue(DESIGN);
    renderAt();

    expect(await screen.findByRole('heading', { name: 'URL shortener' })).toBeTruthy();
    expect(screen.getByLabelText('Score 12 out of 100')).toBeTruthy();
    expect(screen.getByText('“p99 under 50 ms”')).toBeTruthy();
    expect(screen.getByText('A read-heavy key-value problem.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revise this answer' })).toBeNull();

    const answer = screen.getByRole('region', { name: 'Your answer' });
    expect(within(answer).getByText('Short links that redirect fast, with p99 under 50 ms.')).toBeTruthy();
    expect(within(answer).getByText('Nothing written.')).toBeTruthy();
  });

  it('says so when the attempt is not in this account’s history', async () => {
    fetchPracticeAttempt.mockRejectedValue(new ApiError(404, 'Not Found'));
    renderAt();

    expect(await screen.findByText('That attempt is not in your practice history.')).toBeTruthy();
  });
});
