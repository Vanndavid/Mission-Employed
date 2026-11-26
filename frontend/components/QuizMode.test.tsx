import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../services/http';
import { QuizCatalog, QuizProgress, QuizQuestion } from '../types/practice';

/**
 * The quiz screen: pick a language and a round, answer, and only then see
 * whether it was right and why. The answer key lives on the server, so the
 * explanation can only come from the answer call.
 */

const catalog: QuizCatalog = {
  languages: [
    {
      key: 'javascript',
      label: 'JavaScript',
      questionCount: 12,
      topics: [
        { key: 'scope', label: 'Scope & closures', questionCount: 6 },
        { key: 'async', label: 'Promises & async', questionCount: 6 },
      ],
    },
    { key: 'python', label: 'Python', questionCount: 0, topics: [] },
  ],
};

const progress = (openMistakes = 0): QuizProgress => ({
  language: 'javascript',
  answered: 4,
  correct: 3,
  accuracy: 75,
  openMistakes,
  topics: [
    { key: 'scope', label: 'Scope & closures', answered: 4, correct: 3, accuracy: 75, openMistakes },
    { key: 'async', label: 'Promises & async', answered: 0, correct: 0, accuracy: null, openMistakes: 0 },
  ],
});

const hoisting: QuizQuestion = {
  id: 11,
  topic: 'scope',
  difficulty: 'easy',
  prompt: 'What does this print?',
  code: 'console.log(x);\nvar x = 5;',
  options: ['5', 'undefined', 'ReferenceError', 'null'],
};

const typeofNull: QuizQuestion = {
  id: 12,
  topic: 'scope',
  difficulty: 'easy',
  prompt: 'What is typeof null?',
  code: null,
  options: ['null', 'object', 'undefined', 'number'],
};

const fetchQuizCatalog = vi.fn();
const fetchQuizProgress = vi.fn();
const startQuizRound = vi.fn();
const answerQuizQuestion = vi.fn();

vi.mock('../services/practiceClient', () => ({
  fetchQuizCatalog: (...args: unknown[]) => fetchQuizCatalog(...args),
  fetchQuizProgress: (...args: unknown[]) => fetchQuizProgress(...args),
  startQuizRound: (...args: unknown[]) => startQuizRound(...args),
  answerQuizQuestion: (...args: unknown[]) => answerQuizQuestion(...args),
}));

const reportQuestion = vi.fn();

vi.mock('../services/questionBankClient', () => ({
  reportQuestion: (...args: unknown[]) => reportQuestion(...args),
}));

const { QuizMode } = await import('./QuizMode');

const HOISTING_WHY = 'var is hoisted and starts as undefined.';
const TYPEOF_WHY = 'typeof null is object, an old bug.';

async function startMixedRound() {
  render(<QuizMode />);
  fireEvent.click(await screen.findByRole('button', { name: /Mixed round/ }));
  await screen.findByText('What does this print?');
}

beforeEach(() => {
  fetchQuizCatalog.mockReset().mockResolvedValue(catalog);
  fetchQuizProgress.mockReset().mockResolvedValue(progress());
  startQuizRound.mockReset().mockResolvedValue({ language: 'javascript', topic: 'mixed', questions: [hoisting, typeofNull] });
  answerQuizQuestion.mockReset().mockImplementation((id: number, choice: string | null) =>
    Promise.resolve(
      id === 11
        ? { correct: choice === 'undefined', answer: 'undefined', explanation: HOISTING_WHY }
        : { correct: choice === 'object', answer: 'object', explanation: TYPEOF_WHY },
    ),
  );
});

describe('QuizMode', () => {
  it('lists the languages and topics, with the accuracy so far', async () => {
    render(<QuizMode />);

    const scope = await screen.findByRole('button', { name: /Scope & closures/ });
    await waitFor(() => expect(scope).toHaveTextContent('75%'));
    expect(screen.getByRole('button', { name: /Python/ })).toBeDisabled();
    // No open mistakes yet, so there is nothing to retry.
    expect(screen.getByRole('button', { name: /Mistakes/ })).toBeDisabled();
    expect(fetchQuizProgress).toHaveBeenCalledWith('javascript', expect.anything());
  });

  it('shows the explanation only after answering', async () => {
    await startMixedRound();

    expect(startQuizRound).toHaveBeenCalledWith('javascript', 'mixed');
    // The snippet, numbered line by line.
    const code = screen.getByRole('figure', { name: 'Code' });
    expect(within(code).getByText('var x = 5;')).toBeTruthy();
    expect(within(code).getByText('2')).toBeTruthy();
    expect(screen.queryByText(HOISTING_WHY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /undefined/ }));

    expect(await screen.findByText(HOISTING_WHY)).toBeTruthy();
    expect(screen.getByText(/Correct/)).toBeTruthy();
    expect(answerQuizQuestion).toHaveBeenCalledWith(11, 'undefined');
  });

  it('answers with the number and letter keys', async () => {
    await startMixedRound();

    fireEvent.keyDown(window, { key: '1' });
    expect(await screen.findByText(/Not quite/)).toBeTruthy();
    expect(answerQuizQuestion).toHaveBeenCalledWith(11, '5');

    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    fireEvent.keyDown(window, { key: 'b' });
    expect(await screen.findByText(TYPEOF_WHY)).toBeTruthy();
    expect(answerQuizQuestion).toHaveBeenLastCalledWith(12, 'object');
  });

  it('ends with a summary that retries only the missed questions', async () => {
    await startMixedRound();

    fireEvent.click(screen.getByRole('button', { name: /ReferenceError/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Next question/ }));
    fireEvent.click(screen.getByRole('button', { name: /object/ }));
    fireEvent.click(await screen.findByRole('button', { name: /See results/ }));

    expect(await screen.findByText('1 / 2')).toBeTruthy();
    expect(screen.getByText(HOISTING_WHY)).toBeTruthy();
    expect(screen.queryByText(TYPEOF_WHY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Retry mistakes/ }));

    expect(await screen.findByText('What does this print?')).toBeTruthy();
    expect(screen.getByText(/1 of 1/)).toBeTruthy();
    // The retry is local: it reuses the questions already on screen.
    expect(startQuizRound).toHaveBeenCalledTimes(1);
  });

  it('keeps the question open when an answer cannot be checked', async () => {
    answerQuizQuestion.mockRejectedValueOnce(new ApiError(0, 'Could not reach the server. Is the API running?', 'network'));
    await startMixedRound();

    fireEvent.click(screen.getByRole('button', { name: /undefined/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(screen.queryByText(HOISTING_WHY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /undefined/ }));
    expect(await screen.findByText(HOISTING_WHY)).toBeTruthy();
  });

  it('says so when there are no open mistakes to serve', async () => {
    fetchQuizProgress.mockResolvedValue(progress(2));
    startQuizRound.mockResolvedValue({ language: 'javascript', topic: 'mistakes', questions: [] });
    render(<QuizMode />);

    const mistakes = await screen.findByRole('button', { name: /Mistakes/ });
    await waitFor(() => expect(mistakes).toBeEnabled());
    fireEvent.click(mistakes);

    expect(await screen.findByText(/No open mistakes/)).toBeTruthy();
    expect(startQuizRound).toHaveBeenCalledWith('javascript', 'mistakes');
  });

  it('offers to report a question once it has been answered, without leaving it', async () => {
    reportQuestion.mockReset().mockResolvedValue(undefined);
    await startMixedRound();

    expect(screen.queryByRole('button', { name: 'Report this question' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ReferenceError/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Report this question' }));

    const reason = screen.getByLabelText(/What is wrong/);
    fireEvent.change(reason, { target: { value: 'Should be undefined' } });
    // Typing in the box is not the quiz's keyboard: Enter does not move on.
    fireEvent.keyDown(reason, { key: 'Enter' });
    expect(screen.getByText(/1 of 2/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/Thanks/)).toBeTruthy();
    expect(reportQuestion).toHaveBeenCalledWith(11, 'Should be undefined');

    // The next question starts with a fresh link.
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    fireEvent.click(screen.getByRole('button', { name: /object/ }));
    expect(await screen.findByRole('button', { name: 'Report this question' })).toBeTruthy();
  });
});
