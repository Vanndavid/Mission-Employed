import { describe, expect, it } from 'vitest';
import { AreaResult, PracticeProgress } from '../types/practiceHistory';
import { CoachArea, coachAreas, coachPicks, rankWeakAreas, RECENT_PER_AREA, weighArea } from './practiceCoach';

/**
 * The coach on Mission Control: which areas, across every practice mode,
 * cost the most points at the user's recent average, newer results counting
 * more. A pure function of what GET /api/practice/progress returns.
 */

/** Results one day apart, newest first: `points` of `max` each. */
function results(scores: number[], max = 1, newest = 25): AreaResult[] {
  return scores.map((points, i) => ({
    at: `2026-11-${String(newest - i).padStart(2, '0')}T09:00:00.000000Z`,
    points,
    maxPoints: max,
  }));
}

function area(key: string, scores: number[], extra: Partial<CoachArea> = {}): CoachArea {
  return {
    key,
    mode: 'quiz',
    label: key,
    scale: 10,
    results: results(scores),
    start: { mode: 'quiz', language: 'javascript', topic: key },
    ...extra,
  };
}

const keys = (areas: { key: string }[]) => areas.map(a => a.key);

describe('weighArea', () => {
  it('is nothing to go on when an area has no results', () => {
    expect(weighArea(area('scope', []))).toBeNull();
  });

  it('is the points lost on a 100-point attempt at the recent average', () => {
    // Every answer wrong: the whole scale is lost; half right, half of it.
    expect(weighArea(area('a', [0, 0, 0]))?.pointsLost).toBeCloseTo(10);
    expect(weighArea(area('b', [1, 1, 1]))?.pointsLost).toBe(0);
    expect(weighArea(area('c', [0], { scale: 1, results: results([6], 12) }))?.pointsLost).toBeCloseTo(6);
  });

  it('counts newer results more than older ones', () => {
    const slipping = weighArea(area('slipping', [0, 0, 1, 1]))!;
    const improving = weighArea(area('improving', [1, 1, 0, 0]))!;

    // The same two of four right, but the recent misses cost more.
    expect(slipping.pointsLost).toBeGreaterThan(5);
    expect(improving.pointsLost).toBeLessThan(5);
    expect(slipping.average).toBeLessThan(50);
    expect(improving.average).toBeGreaterThan(50);
  });

  it('reads only the latest results, in date order whatever order they come in', () => {
    const recovered = area('recovered', [...Array(RECENT_PER_AREA).fill(1), 0, 0, 0, 0]);
    expect(weighArea(recovered)?.pointsLost).toBe(0);
    expect(weighArea(recovered)?.considered).toBe(RECENT_PER_AREA);

    const shuffled = { ...area('x', []), results: [...results([0, 0, 1, 1])].reverse() };
    expect(weighArea(shuffled)?.pointsLost).toBeCloseTo(weighArea(area('y', [0, 0, 1, 1]))!.pointsLost);
    expect(weighArea(shuffled)?.lastAt).toBe('2026-11-25T09:00:00.000000Z');
  });
});

describe('rankWeakAreas', () => {
  it('puts the area costing the most points first, across modes', () => {
    const ranked = rankWeakAreas([
      area('quiz-half', [0, 1, 0, 1]),
      area('review-security', [], { mode: 'code_review', scale: 1, results: results([0, 52.5], 52.5) }),
      area('design-estimation', [], { mode: 'system_design', scale: 1, results: results([3, 3], 12) }),
    ]);

    // 52.5 missed most recently; 9 of 12 lost; about 6 of a 10-point topic.
    expect(keys(ranked)).toEqual(['review-security', 'design-estimation', 'quiz-half']);
  });

  it('leaves out areas with nothing lost and areas never practised', () => {
    expect(keys(rankWeakAreas([area('perfect', [1, 1]), area('never', []), area('weak', [0])]))).toEqual(['weak']);
  });

  it('breaks a tie with the area practised longest ago, then by key', () => {
    const ranked = rankWeakAreas([
      area('b-recent', [], { results: results([0], 1, 24) }),
      area('c-older', [], { results: results([0], 1, 20) }),
      area('a-recent', [], { results: results([0], 1, 24) }),
    ]);

    expect(keys(ranked)).toEqual(['c-older', 'a-recent', 'b-recent']);
  });
});

describe('coachPicks', () => {
  const quiz = [area('scope', [0, 0]), area('async', [0, 1]), area('types', [1, 0]), area('arrays', [0, 1, 1])];
  const untouched: CoachArea[] = [
    area('security', [], { mode: 'code_review', scale: 1, start: { mode: 'code_review', category: 'security' } }),
    area('estimation', [], { mode: 'system_design', scale: 1, start: { mode: 'system_design' } }),
  ];

  it('is the three weakest areas', () => {
    const picks = coachPicks([...quiz, ...untouched], ['quiz', 'code_review', 'system_design']);

    // Arrays' one miss is its latest answer; types' came before a right one.
    expect(picks.map(p => (p.type === 'weak' ? p.area.key : p.mode))).toEqual(['scope', 'async', 'arrays']);
  });

  it('suggests a mode with no attempts only once the weak areas run out', () => {
    const picks = coachPicks([quiz[0], ...untouched], ['quiz', 'code_review', 'system_design']);

    expect(picks).toEqual([
      expect.objectContaining({ type: 'weak', area: expect.objectContaining({ key: 'scope' }) }),
      { type: 'untried', mode: 'code_review' },
      { type: 'untried', mode: 'system_design' },
    ]);
  });

  it('only suggests modes the account can open', () => {
    const lostPremium = [...quiz.slice(0, 1), area('bug', [0], { mode: 'code_review', scale: 1, results: results([0], 50) })];

    const picks = coachPicks([...lostPremium, ...untouched], ['quiz']);

    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ type: 'weak', area: { key: 'scope' } });
  });

  it('has nothing to say before anything has been practised but the modes to try', () => {
    expect(coachPicks(untouched, ['code_review'])).toEqual([{ type: 'untried', mode: 'code_review' }]);
    expect(coachPicks([], [])).toEqual([]);
  });
});

describe('coachAreas', () => {
  const progress: PracticeProgress = {
    windowDays: 30,
    since: '2026-10-27T12:00:00.000000Z',
    quiz: {
      kind: 'quiz',
      attempts: 3,
      averageScore: 33,
      lastAttemptAt: '2026-11-25T09:00:00.000000Z',
      openMistakes: 2,
      languages: [
        {
          key: 'javascript',
          label: 'JavaScript',
          answered: 3,
          correct: 1,
          accuracy: 33,
          openMistakes: 2,
          topics: [
            { key: 'scope', label: 'Scope', answered: 2, correct: 1, accuracy: 50, openMistakes: 0, recent: results([1, 0]) },
            { key: 'async', label: 'Async', answered: 1, correct: 0, accuracy: 0, openMistakes: 2, recent: results([0]) },
            { key: 'types', label: 'Types', answered: 0, correct: 0, accuracy: null, openMistakes: 0, recent: [] },
            { key: 'arrays', label: 'Arrays', answered: 0, correct: 0, accuracy: null, openMistakes: 0, recent: [] },
          ],
        },
      ],
    },
    codeReview: {
      kind: 'code_review',
      attempts: 1,
      averageScore: 60,
      lastAttemptAt: '2026-11-20T09:00:00.000000Z',
      categories: [
        { key: 'security', label: 'Security', planted: 1, found: 1, foundRate: 100, recent: results([52.5], 52.5) },
        { key: 'bug', label: 'Bug', planted: 1, found: 0, foundRate: 0, recent: results([0], 17.5) },
      ],
    },
    systemDesign: {
      kind: 'system_design',
      attempts: 0,
      averageScore: null,
      lastAttemptAt: null,
      traits: [{ key: 'estimation', label: 'Estimation', maxPoints: 12, attempts: 0, averagePoints: null, average: null, recent: [] }],
    },
  };

  it('makes an area of every quiz topic, review category and design trait, each with its start', () => {
    const areas = coachAreas(progress);

    expect(keys(areas)).toEqual([
      'quiz:javascript:scope',
      'quiz:javascript:async',
      'quiz:javascript:types',
      'quiz:javascript:arrays',
      'code_review:security',
      'code_review:bug',
      'system_design:estimation',
    ]);
    expect(areas[1]).toMatchObject({
      mode: 'quiz',
      label: 'JavaScript · Async',
      // A topic is a quarter of a mixed round in a language with four.
      scale: 25,
      start: { mode: 'quiz', language: 'javascript', topic: 'async' },
      mistakes: { language: 'javascript', count: 2 },
    });
    expect(areas[5]).toMatchObject({ mode: 'code_review', label: 'Bug', scale: 1, start: { mode: 'code_review', category: 'bug' } });
    expect(areas[6]).toMatchObject({ mode: 'system_design', label: 'Estimation', scale: 1, start: { mode: 'system_design' } });
  });

  it('ranks them on one scale', () => {
    const picks = coachPicks(coachAreas(progress), ['quiz', 'code_review', 'system_design']);

    // A missed bug cost 17.5 of the review's points; the async miss a
    // quarter of a quiz round, 25; scope at half right weighted to its
    // recent right answer, under that.
    expect(picks.map(p => (p.type === 'weak' ? p.area.key : p.mode))).toEqual([
      'quiz:javascript:async',
      'code_review:bug',
      'quiz:javascript:scope',
    ]);
  });
});
