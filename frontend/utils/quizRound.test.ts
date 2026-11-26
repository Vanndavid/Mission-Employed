import { describe, expect, it } from 'vitest';
import { QuizQuestion, QuizVerdict } from '../types/practice';
import {
  MISTAKES,
  MIXED,
  QuizRound,
  QuizRoundAction,
  missedQuestions,
  optionIndexForKey,
  quizRoundReducer,
  retryQuestions,
  roundLabel,
  roundScore,
} from './quizRound';

/**
 * A quiz round, as a pure reducer over the questions the server served. The
 * server scores every answer, so choosing an option only marks the question
 * as being checked; the verdict, with the answer and explanation, arrives as
 * its own action.
 */

const question = (id: number, options = ['a', 'b', 'c', 'd']): QuizQuestion => ({
  id,
  topic: 'scope',
  difficulty: 'easy',
  prompt: `Question ${id}`,
  code: null,
  options,
});

const right: QuizVerdict = { correct: true, answer: 'a', explanation: 'Because a.' };
const wrong: QuizVerdict = { correct: false, answer: 'a', explanation: 'Because a, not b.' };

const run = (actions: QuizRoundAction[], state: QuizRound | null = null) => actions.reduce(quizRoundReducer, state);

const start = (questions = [question(1), question(2)], timed = false): QuizRoundAction => ({
  type: 'start',
  language: 'javascript',
  topic: MIXED,
  questions,
  timed,
});

describe('quizRoundReducer', () => {
  it('starts on the first question, open', () => {
    const round = run([start([question(1), question(2)], true)])!;

    expect(round.index).toBe(0);
    expect(round.choice).toBeUndefined();
    expect(round.checking).toBe(false);
    expect(round.verdict).toBeNull();
    expect(round.timed).toBe(true);
    expect(round.finished).toBe(false);
  });

  it('does not start a round with no questions', () => {
    expect(run([start([])])).toBeNull();
  });

  it('marks a choice as being checked until the verdict arrives', () => {
    const round = run([start(), { type: 'choose', choice: 'b' }])!;

    expect(round.choice).toBe('b');
    expect(round.checking).toBe(true);
    expect(round.verdict).toBeNull();
    expect(round.answers).toEqual([]);
  });

  it('takes one choice per question', () => {
    const round = run([start(), { type: 'choose', choice: 'b' }, { type: 'choose', choice: 'c' }])!;

    expect(round.choice).toBe('b');
  });

  it('records the verdict, with the answer and explanation, against the question', () => {
    const round = run([start(), { type: 'choose', choice: 'b' }, { type: 'verdict', questionId: 1, verdict: wrong }])!;

    expect(round.checking).toBe(false);
    expect(round.verdict).toEqual(wrong);
    expect(round.answers).toEqual([{ question: question(1), choice: 'b', ...wrong }]);
  });

  it('ignores a verdict for a question that is no longer on screen', () => {
    const round = run([start(), { type: 'choose', choice: 'b' }, { type: 'verdict', questionId: 2, verdict: right }])!;

    expect(round.verdict).toBeNull();
    expect(round.answers).toEqual([]);
  });

  it('records time running out as a null choice', () => {
    const round = run([start(), { type: 'choose', choice: null }, { type: 'verdict', questionId: 1, verdict: wrong }])!;

    expect(round.choice).toBeNull();
    expect(round.answers[0].choice).toBeNull();
  });

  it('reopens the question when the answer could not be checked', () => {
    const round = run([
      start(),
      { type: 'choose', choice: 'b' },
      { type: 'failed', questionId: 1, message: 'Could not reach the server.' },
    ])!;

    expect(round.choice).toBeUndefined();
    expect(round.checking).toBe(false);
    expect(round.error).toBe('Could not reach the server.');

    const retried = run([{ type: 'choose', choice: 'a' }], round)!;
    expect(retried.error).toBeNull();
    expect(retried.choice).toBe('a');
  });

  it('only moves on once the verdict is in', () => {
    const checking = run([start(), { type: 'choose', choice: 'a' }])!;
    expect(run([{ type: 'next' }], checking)!.index).toBe(0);

    const answered = run([{ type: 'verdict', questionId: 1, verdict: right }, { type: 'next' }], checking)!;
    expect(answered.index).toBe(1);
    expect(answered.choice).toBeUndefined();
    expect(answered.verdict).toBeNull();
  });

  it('finishes after the last question', () => {
    const round = run([
      start(),
      { type: 'choose', choice: 'a' },
      { type: 'verdict', questionId: 1, verdict: right },
      { type: 'next' },
      { type: 'choose', choice: 'b' },
      { type: 'verdict', questionId: 2, verdict: { ...wrong } },
      { type: 'next' },
    ])!;

    expect(round.finished).toBe(true);
    expect(roundScore(round)).toBe(1);
    expect(missedQuestions(round).map(q => q.id)).toEqual([2]);
    // A finished round takes no more answers.
    expect(run([{ type: 'choose', choice: 'a' }], round)).toBe(round);
  });

  it('drops a question the server no longer has, finishing if it was the last', () => {
    const dropped = run([start(), { type: 'drop', questionId: 1 }])!;
    expect(dropped.questions.map(q => q.id)).toEqual([2]);
    expect(dropped.index).toBe(0);

    const onLast = run([
      start([question(1), question(2), question(3)]),
      { type: 'drop', questionId: 1 },
      { type: 'choose', choice: 'a' },
      { type: 'verdict', questionId: 2, verdict: right },
      { type: 'next' },
    ])!;
    expect(onLast.index).toBe(1);
    // Only the question on screen can be dropped.
    expect(run([{ type: 'drop', questionId: 2 }], onLast)).toBe(onLast);

    const finished = run([{ type: 'drop', questionId: 3 }], onLast)!;
    expect(finished.finished).toBe(true);
    expect(finished.questions.map(q => q.id)).toEqual([2]);

    // Nothing answered and nothing left: there is no round.
    expect(run([start([question(1)]), { type: 'drop', questionId: 1 }])).toBeNull();
  });

  it('ends the round on quit', () => {
    expect(run([start(), { type: 'quit' }])).toBeNull();
  });
});

describe('retryQuestions', () => {
  it('is the missed questions, with their options shuffled again', () => {
    const round = run([
      start([question(1), question(2, ['w', 'x', 'y', 'z'])]),
      { type: 'choose', choice: 'a' },
      { type: 'verdict', questionId: 1, verdict: right },
      { type: 'next' },
      { type: 'choose', choice: null },
      { type: 'verdict', questionId: 2, verdict: { correct: false, answer: 'w', explanation: 'w.' } },
      { type: 'next' },
    ])!;

    // With random() always 0, the shuffle moves the first option to the end.
    const retry = retryQuestions(round, () => 0);

    expect(retry.map(q => q.id)).toEqual([2]);
    expect(retry[0].options).toEqual(['x', 'y', 'z', 'w']);
  });
});

describe('optionIndexForKey', () => {
  it('reads 1-4 and A-D, either case', () => {
    expect(['1', '2', '3', '4'].map(k => optionIndexForKey(k, 4))).toEqual([0, 1, 2, 3]);
    expect(['a', 'B', 'c', 'D'].map(k => optionIndexForKey(k, 4))).toEqual([0, 1, 2, 3]);
  });

  it('ignores anything else, or an option that is not there', () => {
    expect(optionIndexForKey('5', 4)).toBeNull();
    expect(optionIndexForKey('e', 4)).toBeNull();
    expect(optionIndexForKey('Enter', 4)).toBeNull();
    expect(optionIndexForKey('4', 3)).toBeNull();
  });
});

describe('roundLabel', () => {
  it('names the round', () => {
    expect(roundLabel(MIXED, [])).toBe('Mixed round');
    expect(roundLabel(MISTAKES, [])).toBe('Your mistakes');
    expect(roundLabel('scope', [{ key: 'scope', label: 'Scope & closures', questionCount: 6 }])).toBe('Scope & closures');
    expect(roundLabel('gone', [])).toBe('gone');
  });
});
