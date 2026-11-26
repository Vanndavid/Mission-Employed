import { describe, expect, it } from 'vitest';
import { AdminQuestion } from '../types/questionBank';
import { quizAnswer, quizNotes, toQuizForm, toQuizPatch } from './questionDraft';

const base: AdminQuestion = {
  id: 1,
  kind: 'quiz',
  language: 'javascript',
  topic: 'scope',
  difficulty: 'easy',
  prompt: 'What does this print?',
  code: 'console.log(x);',
  options: ['5', 'undefined', 'ReferenceError', 'null'],
  answer: { choice: 'undefined' },
  explanation: 'Hoisting.',
  reviewNotes: null,
  status: 'draft',
  source: 'ai',
  externalId: null,
  attemptCount: 0,
  openReports: 0,
  reports: [],
  createdAt: null,
  updatedAt: null,
};

describe('quiz edit form', () => {
  it('round-trips a question into a whole PATCH', () => {
    const form = toQuizForm(base);

    expect(form.answerIndex).toBe(1);
    expect(toQuizPatch(form)).toEqual({
      language: 'javascript',
      topic: 'scope',
      difficulty: 'easy',
      prompt: 'What does this print?',
      code: 'console.log(x);',
      options: ['5', 'undefined', 'ReferenceError', 'null'],
      answer: { choice: 'undefined' },
      explanation: 'Hoisting.',
    });
  });

  it('sends a blank snippet as no snippet and a missing key as null', () => {
    const form = { ...toQuizForm({ ...base, answer: { choice: 'gone' } }), code: '  \n ' };

    expect(form.answerIndex).toBeNull();
    const patch = toQuizPatch(form);
    expect(patch.code).toBeNull();
    expect(patch.answer).toEqual({ choice: null });
  });

  it('always has four option boxes, even for a broken question', () => {
    expect(toQuizForm({ ...base, options: ['a', 'b'] }).options).toEqual(['a', 'b', '', '']);
    expect(toQuizForm({ ...base, options: null }).options).toEqual(['', '', '', '']);
  });
});

describe('quiz review notes', () => {
  it('reads the key and flags a note written against it', () => {
    const question = {
      ...base,
      reviewNotes: {
        distractors: [
          { option: '5', why: 'Runs first.' },
          { option: 'undefined', why: 'Odd.' },
          { bad: true },
        ],
      },
    };

    expect(quizAnswer(question)).toBe('undefined');
    expect(quizNotes(question)).toEqual([
      { option: '5', why: 'Runs first.', onAnswer: false },
      { option: 'undefined', why: 'Odd.', onAnswer: true },
    ]);
    expect(quizNotes(base)).toEqual([]);
  });
});
