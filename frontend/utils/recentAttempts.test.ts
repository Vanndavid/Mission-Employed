import { describe, expect, it } from 'vitest';
import { CodingHistoryEntry } from '../types';
import { PracticeAttemptSummary } from '../types/practiceHistory';
import { attemptDetail, attemptOutcome, recentAttempts } from './recentAttempts';

/**
 * Mission Control's "Recent attempts": Problems' tutor attempts and the
 * other modes' scored attempts in one list, newest first.
 */

const problem = (date: string, title: string, completed = true): CodingHistoryEntry => ({
  id: Number(date.replace(/-/g, '')),
  date,
  difficulty: 'easy',
  title,
  completed,
  topics: ['Arrays'],
});

const practice = (id: number, createdAt: string, extra: Partial<PracticeAttemptSummary> = {}): PracticeAttemptSummary => ({
  id,
  kind: 'quiz',
  title: 'What does this print?',
  language: 'javascript',
  topic: 'async',
  topicLabel: 'Promises & async',
  difficulty: 'easy',
  score: 1,
  maxScore: 1,
  correct: true,
  createdAt,
  ...extra,
});

describe('recentAttempts', () => {
  it('merges both kinds newest first, by the day each happened here', () => {
    const rows = recentAttempts(
      [problem('2026-11-24', 'Two Sum'), problem('2026-11-20', 'Rotate')],
      [practice(9, '2026-11-25T12:00:00.000000Z'), practice(8, '2026-11-22T12:00:00.000000Z', { kind: 'code_review', title: 'Orders page', score: 62, maxScore: 100, correct: null })],
    );

    expect(rows.map(r => r.title)).toEqual(['What does this print?', 'Two Sum', 'Orders page', 'Rotate']);
    expect(rows[0]).toMatchObject({ mode: 'quiz', attemptId: 9, date: '2026-11-25' });
    expect(rows[1]).toMatchObject({ mode: 'problems', attemptId: null });
  });

  it('keeps the newest ones only', () => {
    const many = Array.from({ length: 8 }, (_, i) => practice(i + 1, `2026-11-${10 + i}T12:00:00.000000Z`));
    const rows = recentAttempts([problem('2026-11-01', 'Old')], many, 5);

    expect(rows).toHaveLength(5);
    expect(rows[0].attemptId).toBe(8);
  });

  it('says how each went in that mode’s terms', () => {
    expect(attemptOutcome(practice(1, '2026-11-25T09:00:00Z'))).toEqual({ text: 'Right', good: true });
    expect(attemptOutcome(practice(1, '2026-11-25T09:00:00Z', { correct: false, score: 0 }))).toEqual({ text: 'Wrong', good: false });
    expect(attemptOutcome(practice(1, '2026-11-25T09:00:00Z', { kind: 'system_design', score: 72, maxScore: 100, correct: null }))).toEqual({
      text: '72 / 100',
      good: true,
    });
    expect(attemptOutcome(practice(1, '2026-11-25T09:00:00Z', { kind: 'code_review', score: 30, maxScore: 100, correct: null }))).toEqual({
      text: '30 / 100',
      good: false,
    });
  });

  it('names the mode and what the attempt was on', () => {
    expect(attemptDetail(practice(1, '2026-11-25T09:00:00Z'))).toBe('Quiz · JavaScript · Promises & async');
    expect(attemptDetail(practice(1, '2026-11-25T09:00:00Z', { kind: 'code_review', language: 'python', topic: null, topicLabel: null, difficulty: 'hard' }))).toBe(
      'Code review · Python · hard',
    );
    expect(attemptDetail(practice(1, '2026-11-25T09:00:00Z', { kind: 'system_design', language: null, topic: null, topicLabel: null, difficulty: 'medium' }))).toBe(
      'System design · medium',
    );
  });
});
