import { describe, expect, it } from 'vitest';
import {
  attemptPath,
  HISTORY_PATH,
  mistakesPath,
  readQuizLaunch,
  readReviewCategory,
  startPath,
} from './practiceLinks';

/**
 * The addresses the coach and the history link to. A start is carried in
 * the mode's query string, so one click starts it and the mode reads it back.
 */

const params = (path: string) => new URLSearchParams(path.split('?')[1] ?? '');

describe('practiceLinks', () => {
  it('starts a quiz round on a topic, or a mistakes round, from the quiz address', () => {
    const topic = startPath({ mode: 'quiz', language: 'javascript', topic: 'async' });
    expect(topic).toBe('/dashboard/quiz?language=javascript&topic=async');
    expect(readQuizLaunch(params(topic))).toEqual({ language: 'javascript', topic: 'async' });

    expect(readQuizLaunch(params(mistakesPath('sql')))).toEqual({ language: 'sql', topic: 'mistakes' });
  });

  it('starts a code review in a category, and system design as it is', () => {
    const review = startPath({ mode: 'code_review', category: 'security' });
    expect(review).toBe('/dashboard/code-review?category=security');
    expect(readReviewCategory(params(review))).toBe('security');

    expect(startPath({ mode: 'system_design' })).toBe('/dashboard/system-design');
  });

  it('ignores a query it does not recognise', () => {
    expect(readQuizLaunch(params('/dashboard/quiz'))).toBeNull();
    expect(readQuizLaunch(params('/dashboard/quiz?language=cobol&topic=x'))).toBeNull();
    expect(readQuizLaunch(params('/dashboard/quiz?language=python'))).toBeNull();
    expect(readReviewCategory(params('/dashboard/code-review?category=style'))).toBeNull();
    expect(readReviewCategory(params('/dashboard/code-review?category=toString'))).toBeNull();
    expect(readReviewCategory(params('/dashboard/code-review'))).toBeNull();
  });

  it('gives each attempt a page under the history', () => {
    expect(HISTORY_PATH).toBe('/dashboard/history');
    expect(attemptPath(41)).toBe('/dashboard/history/41');
  });
});
