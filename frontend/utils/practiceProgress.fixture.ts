/**
 * A GET /api/practice/progress response for component tests: JavaScript
 * async answered wrong twice (with two open mistakes), a review that missed
 * a bug, and nothing yet in system design.
 */

import { AreaResult, PracticeProgress } from '../types/practiceHistory';

export function areaResults(scores: number[], max = 1): AreaResult[] {
  return scores.map((points, i) => ({ at: `2026-11-${String(25 - i).padStart(2, '0')}T12:00:00.000000Z`, points, maxPoints: max }));
}

export function progressFixture(overrides: Partial<PracticeProgress> = {}): PracticeProgress {
  return {
    windowDays: 30,
    since: '2026-10-27T12:00:00.000000Z',
    quiz: {
      kind: 'quiz',
      attempts: 4,
      averageScore: 25,
      lastAttemptAt: '2026-11-25T12:00:00.000000Z',
      openMistakes: 2,
      languages: [
        {
          key: 'javascript',
          label: 'JavaScript',
          answered: 4,
          correct: 1,
          accuracy: 25,
          openMistakes: 2,
          topics: [
            { key: 'async', label: 'Promises & async', answered: 2, correct: 0, accuracy: 0, openMistakes: 2, recent: areaResults([0, 0]) },
            { key: 'scope', label: 'Scope & closures', answered: 2, correct: 1, accuracy: 50, openMistakes: 0, recent: areaResults([1, 0]) },
          ],
        },
      ],
    },
    codeReview: {
      kind: 'code_review',
      attempts: 1,
      averageScore: 53,
      lastAttemptAt: '2026-11-24T12:00:00.000000Z',
      categories: [
        { key: 'security', label: 'Security', planted: 1, found: 1, foundRate: 100, recent: areaResults([52.5], 52.5) },
        { key: 'bug', label: 'Bug', planted: 1, found: 0, foundRate: 0, recent: areaResults([0], 17.5) },
      ],
    },
    systemDesign: {
      kind: 'system_design',
      attempts: 0,
      averageScore: null,
      lastAttemptAt: null,
      traits: [{ key: 'estimation', label: 'Estimation', maxPoints: 12, attempts: 0, averagePoints: null, average: null, recent: [] }],
    },
    ...overrides,
  };
}
