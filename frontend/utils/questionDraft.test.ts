import { describe, expect, it } from 'vitest';
import { AdminQuestion } from '../types/questionBank';
import {
  blankIssue,
  plantedIssues,
  quizAnswer,
  quizNotes,
  scenarioKeyPoints,
  SYSTEM_DESIGN_TRAITS,
  toCodeReviewForm,
  toCodeReviewPatch,
  toQuizForm,
  toQuizPatch,
  toSystemDesignForm,
  toSystemDesignPatch,
} from './questionDraft';

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

const snippet: AdminQuestion = {
  ...base,
  kind: 'code_review',
  topic: 'One page of orders',
  prompt: 'Returns one page of orders.',
  code: 'line 1\nline 2\nline 3',
  options: null,
  answer: {
    issues: [
      { id: 'sql-injection', lines: [2, 3], category: 'security', severity: 3, summary: 'Injection.', fix: 'Bind it.' },
      { id: 'off-by-one', lines: [1, 1], category: 'bug', severity: 1, summary: 'Off by one.', fix: 'Subtract one.' },
      { id: 'broken', lines: 'x' },
      'not an issue',
    ],
  },
  explanation: 'Read the query first.',
};

describe('code review edit form', () => {
  it('reads the planted issues, skipping anything that is not one', () => {
    expect(plantedIssues(snippet).map(issue => issue.id)).toEqual(['sql-injection', 'off-by-one']);
    expect(plantedIssues({ ...snippet, answer: {} })).toEqual([]);
  });

  it('round-trips a snippet into a whole PATCH, the title as topic and the issues as the key', () => {
    const form = toCodeReviewForm({ ...snippet, answer: { issues: (snippet.answer.issues as unknown[]).slice(0, 2) } });

    expect(form.title).toBe('One page of orders');
    expect(form.issues[0]).toEqual({
      id: 'sql-injection',
      start: 2,
      end: 3,
      category: 'security',
      severity: 3,
      summary: 'Injection.',
      fix: 'Bind it.',
    });
    expect(toCodeReviewPatch(form)).toEqual({
      language: 'javascript',
      topic: 'One page of orders',
      difficulty: 'easy',
      prompt: 'Returns one page of orders.',
      code: 'line 1\nline 2\nline 3',
      answer: {
        issues: [
          { id: 'sql-injection', lines: [2, 3], category: 'security', severity: 3, summary: 'Injection.', fix: 'Bind it.' },
          { id: 'off-by-one', lines: [1, 1], category: 'bug', severity: 1, summary: 'Off by one.', fix: 'Subtract one.' },
        ],
      },
      explanation: 'Read the query first.',
    });
  });

  it('starts a new issue blank, for the server to check', () => {
    expect(blankIssue()).toEqual({ id: '', start: 1, end: 1, category: 'bug', severity: 2, summary: '', fix: '' });
  });
});

const scenario: AdminQuestion = {
  ...base,
  kind: 'system_design',
  language: null,
  topic: 'URL shortener',
  prompt: 'Design a URL shortener for 100 million links a month.',
  code: null,
  options: null,
  answer: {
    keyPoints: {
      requirements: ['Create and follow links', 'A latency target'],
      estimation: ['About 40 writes a second'],
      scalability: 'not a list',
    },
  },
  explanation: 'A read-heavy key-value problem.',
};

describe('system design edit form', () => {
  it('lists every rubric trait, in order', () => {
    expect(SYSTEM_DESIGN_TRAITS.map(trait => trait.key)).toEqual([
      'requirements',
      'estimation',
      'api_data_model',
      'architecture',
      'scalability',
      'reliability',
      'communication',
    ]);
  });

  it('reads the key points per trait, an empty list where there are none', () => {
    const keyPoints = scenarioKeyPoints(scenario);

    expect(keyPoints.requirements).toEqual(['Create and follow links', 'A latency target']);
    expect(keyPoints.scalability).toEqual([]);
    expect(keyPoints.communication).toEqual([]);
  });

  it('edits key points one a line and sends every trait back, blank lines dropped', () => {
    const form = toSystemDesignForm(scenario);
    expect(form.keyPoints.requirements).toBe('Create and follow links\nA latency target');

    const patch = toSystemDesignPatch({ ...form, keyPoints: { ...form.keyPoints, architecture: '  A cache in front \n\n Read and write paths ' } });

    expect(patch).toEqual({
      topic: 'URL shortener',
      difficulty: 'easy',
      prompt: 'Design a URL shortener for 100 million links a month.',
      answer: {
        keyPoints: {
          requirements: ['Create and follow links', 'A latency target'],
          estimation: ['About 40 writes a second'],
          api_data_model: [],
          architecture: ['A cache in front', 'Read and write paths'],
          scalability: [],
          reliability: [],
          communication: [],
        },
      },
      explanation: 'A read-heavy key-value problem.',
    });
  });
});
