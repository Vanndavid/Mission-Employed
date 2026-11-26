import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../services/http';
import { QuizCatalog } from '../types/practice';
import { AdminQuestion, QuestionBankPage } from '../types/questionBank';

/**
 * Admin · Question bank: AI drafts are generated, reviewed as a user would
 * see them with the key and the AI's notes beside them, edited, and only
 * then published. Seed questions are read-only here.
 */

const fetchQuestionBank = vi.fn();
const generateDrafts = vi.fn();
const updateQuestion = vi.fn();
const deleteQuestion = vi.fn();
const resolveReports = vi.fn();
const fetchQuizCatalog = vi.fn();
let isAdmin = true;

vi.mock('../services/questionBankClient', () => ({
  fetchQuestionBank: (...args: unknown[]) => fetchQuestionBank(...args),
  generateDrafts: (...args: unknown[]) => generateDrafts(...args),
  updateQuestion: (...args: unknown[]) => updateQuestion(...args),
  deleteQuestion: (...args: unknown[]) => deleteQuestion(...args),
  resolveReports: (...args: unknown[]) => resolveReports(...args),
}));

vi.mock('../services/practiceClient', () => ({
  fetchQuizCatalog: (...args: unknown[]) => fetchQuizCatalog(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin, user: { id: 1 } }),
}));

const { AdminQuestionBankPage } = await import('./AdminQuestionBankPage');
const { ToastProvider } = await import('./ToastProvider');

const catalog: QuizCatalog = {
  languages: [
    {
      key: 'javascript',
      label: 'JavaScript',
      questionCount: 3,
      topics: [
        { key: 'scope', label: 'Scope & closures', questionCount: 2 },
        { key: 'async', label: 'Promises & async', questionCount: 1 },
      ],
    },
    { key: 'sql', label: 'SQL', questionCount: 0, topics: [{ key: 'joins', label: 'Joins', questionCount: 0 }] },
  ],
};

const question = (overrides: Partial<AdminQuestion> = {}): AdminQuestion => ({
  id: 7,
  kind: 'quiz',
  language: 'javascript',
  topic: 'scope',
  difficulty: 'medium',
  prompt: 'What does this print?',
  code: 'console.log(x);\nvar x = 5;',
  options: ['5', 'undefined', 'ReferenceError', 'null'],
  answer: { choice: 'undefined' },
  explanation: 'var is hoisted and starts as undefined.',
  reviewNotes: {
    distractors: [
      { option: '5', why: 'The assignment runs after the log.' },
      { option: 'undefined', why: 'Suspicious: a note on the answer.' },
    ],
  },
  status: 'draft',
  source: 'ai',
  externalId: null,
  attemptCount: 0,
  openReports: 0,
  reports: [],
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
  ...overrides,
});

const page = (questions: AdminQuestion[]): QuestionBankPage => ({
  questions,
  meta: { page: 1, perPage: 25, total: questions.length, lastPage: 1 },
  generators: ['quiz'],
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AdminQuestionBankPage />
      </ToastProvider>
    </MemoryRouter>,
  );

const card = async (id = 7) => screen.findByRole('article', { name: `Question ${id}` });

beforeEach(() => {
  isAdmin = true;
  fetchQuestionBank.mockReset().mockResolvedValue(page([question()]));
  fetchQuizCatalog.mockReset().mockResolvedValue(catalog);
  generateDrafts.mockReset();
  updateQuestion.mockReset().mockImplementation(async (id: number, patch: Partial<AdminQuestion>) => question({ id, ...patch }));
  deleteQuestion.mockReset();
  resolveReports.mockReset();
});

describe('AdminQuestionBankPage', () => {
  it('shows a draft as a user would see it, then its key, explanation and review notes', async () => {
    renderPage();
    const draft = await card();

    expect(within(draft).getByText('What does this print?')).toBeTruthy();
    expect(within(draft).getByRole('figure', { name: 'Code' })).toBeTruthy();
    expect(within(draft).getByText('Draft')).toBeTruthy();
    expect(within(draft).getByText(/JavaScript · Scope & closures · medium/)).toBeTruthy();
    expect(within(draft).getByText('Answer: undefined')).toBeTruthy();
    expect(within(draft).getByText('var is hoisted and starts as undefined.')).toBeTruthy();
    expect(within(draft).getByText('The assignment runs after the log.')).toBeTruthy();
    // A note against the key is how a bad key shows: it is flagged.
    expect(within(draft).getByText(/The AI explained why the answer is wrong/)).toBeTruthy();
    expect(fetchQuestionBank).toHaveBeenCalledWith({}, 1, expect.anything());
  });

  it('filters the list', async () => {
    renderPage();
    await card();

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'draft' } });
    await waitFor(() => expect(fetchQuestionBank).toHaveBeenLastCalledWith({ status: 'draft' }, 1, expect.anything()));

    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'javascript' } });
    fireEvent.change(screen.getByLabelText('Filter by topic'), { target: { value: 'scope' } });
    fireEvent.click(screen.getByLabelText('Only reported'));
    await waitFor(() =>
      expect(fetchQuestionBank).toHaveBeenLastCalledWith(
        { status: 'draft', language: 'javascript', topic: 'scope', reported: true },
        1,
        expect.anything(),
      ),
    );
  });

  it('drafts questions with the AI and lists what the checks refused', async () => {
    generateDrafts.mockResolvedValue({
      drafts: [question({ id: 8 })],
      rejected: [{ index: 2, prompt: 'Key not in options', reasons: ['The answer must be exactly one of the options.'] }],
    });
    renderPage();
    await card();

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'async' } });
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'hard' } });
    fireEvent.change(screen.getByLabelText('How many'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft questions' }));

    expect(await screen.findByText(/1 draft saved for review/)).toBeTruthy();
    expect(generateDrafts).toHaveBeenCalledWith({
      kind: 'quiz',
      language: 'javascript',
      topic: 'async',
      difficulty: 'hard',
      count: 4,
    });
    expect(screen.getByText(/Key not in options/)).toBeTruthy();
    expect(screen.getByText('The answer must be exactly one of the options.')).toBeTruthy();
    // The list is reloaded so the new drafts are in it.
    await waitFor(() => expect(fetchQuestionBank).toHaveBeenCalledTimes(2));
  });

  it('says so when the AI is unavailable', async () => {
    generateDrafts.mockRejectedValue(new ApiError(502, 'The AI service is unavailable right now.', 'ai_unavailable'));
    renderPage();
    await card();

    fireEvent.click(screen.getByRole('button', { name: 'Draft questions' }));

    expect(await screen.findByText(/The AI service is not answering right now/)).toBeTruthy();
  });

  it('publishes a draft', async () => {
    renderPage();
    const draft = await card();

    fireEvent.click(within(draft).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(updateQuestion).toHaveBeenCalledWith(7, { status: 'published' }));
    expect(await within(await card()).findByRole('button', { name: 'Unpublish' })).toBeTruthy();
  });

  it('edits a quiz question and sends the whole question back', async () => {
    renderPage();
    const draft = await card();

    fireEvent.click(within(draft).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(draft).getByLabelText('Prompt'), { target: { value: 'What is logged?' } });
    fireEvent.change(within(draft).getByLabelText('Option D'), { target: { value: 'TypeError' } });
    fireEvent.click(within(draft).getByLabelText('Option C is the answer'));
    fireEvent.click(within(draft).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(7, {
        language: 'javascript',
        topic: 'scope',
        difficulty: 'medium',
        prompt: 'What is logged?',
        code: 'console.log(x);\nvar x = 5;',
        options: ['5', 'undefined', 'ReferenceError', 'TypeError'],
        answer: { choice: 'ReferenceError' },
        explanation: 'var is hoisted and starts as undefined.',
      }),
    );
    expect(await within(await card()).findByText('What is logged?')).toBeTruthy();
  });

  it('shows the checks that refused an edit and keeps the form open', async () => {
    updateQuestion.mockRejectedValue(
      new ApiError(422, 'The snippet must be at most 40 lines.', undefined, {
        code: ['The snippet must be at most 40 lines; this one has 41.'],
      }),
    );
    renderPage();
    const draft = await card();

    fireEvent.click(within(draft).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(draft).getByRole('button', { name: 'Save' }));

    expect(await within(draft).findByText('The snippet must be at most 40 lines; this one has 41.')).toBeTruthy();
    expect(within(draft).getByLabelText('Prompt')).toBeTruthy();
  });

  it('deletes a question nobody answered, and unpublishes one somebody did', async () => {
    fetchQuestionBank.mockResolvedValue(page([question(), question({ id: 9, status: 'published', attemptCount: 3 })]));
    deleteQuestion
      .mockResolvedValueOnce({ deleted: true, question: null })
      .mockResolvedValueOnce({ deleted: false, question: question({ id: 9, status: 'draft', attemptCount: 3 }) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    fireEvent.click(within(await card(7)).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Question 7' })).toBeNull());

    fireEvent.click(within(await card(9)).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/unpublished it instead/)).toBeTruthy();
    expect(within(await card(9)).getByText('Draft')).toBeTruthy();
  });

  it('keeps seed questions read-only, but their reports can be resolved', async () => {
    const seed = question({
      id: 3,
      source: 'seed',
      status: 'published',
      externalId: 'quiz-js-scope-01',
      openReports: 2,
      reports: [
        { id: 1, reason: 'The key should be B.', reportedAt: '2026-11-26T00:00:00.000Z' },
        { id: 2, reason: 'Ambiguous wording.', reportedAt: '2026-11-26T00:00:00.000Z' },
      ],
    });
    fetchQuestionBank.mockResolvedValue(page([seed]));
    resolveReports.mockResolvedValue({ ...seed, openReports: 0, reports: [] });
    renderPage();
    const row = await card(3);

    expect(within(row).getByText(/quiz-js-scope-01/)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Unpublish' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(row).getByText('2 open reports')).toBeTruthy();
    expect(within(row).getByText('The key should be B.')).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Resolve reports' }));

    await waitFor(() => expect(resolveReports).toHaveBeenCalledWith(3));
    await waitFor(() => expect(within(row).queryByText('The key should be B.')).toBeNull());
  });

  it('sends a non-admin back to their account', () => {
    isAdmin = false;
    renderPage();

    expect(fetchQuestionBank).not.toHaveBeenCalled();
    expect(screen.queryByText('Admin · Question bank')).toBeNull();
  });
});
