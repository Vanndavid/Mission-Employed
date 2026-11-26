/**
 * The practice coach: what to work on next, across every mode, after
 * Eleph's skill coach (src/features/pte/lib/skillCoach.ts), which ranks
 * tasks by the points they cost at the learner's recent average. No AI: it is
 * a pure function of GET /api/practice/progress.
 *
 * An area is a quiz topic in a language, a code review issue category or a
 * system design rubric trait. Each is ranked by the points it costs on a
 * 100-point attempt of its mode, at a recent average where every older
 * result counts RECENCY_DECAY times the one after it:
 *
 *  - system design: a trait's own points (its weight is already out of 100);
 *  - code review: the detection points the category's planted issues carried
 *    in each review;
 *  - quiz: a topic's share of a mixed round, 100 over the language's topics.
 *
 * Problems (the tutor) is not scored, so it is not here; its weak topics
 * stay in utils/codingTopics.ts. No streaks and no daily goals: they are on
 * CLAUDE.md's deleted list.
 */

import { CodeReviewCategory } from '../types/codeReview';
import { PracticeKind, PracticeLanguage } from '../types/practice';
import { AreaResult, PracticeProgress } from '../types/practiceHistory';

export type CoachMode = PracticeKind;

/** How many areas the coach card shows. */
export const COACH_PICKS = 3;

/** Results per area the average reads, newest first. */
export const RECENT_PER_AREA = 10;

/** Each older result weighs this much of the next newer one. */
export const RECENCY_DECAY = 0.7;

/** What one click on a pick starts. */
export type CoachStart =
  | { mode: 'quiz'; language: PracticeLanguage; topic: string }
  | { mode: 'code_review'; category: CodeReviewCategory }
  | { mode: 'system_design' };

export interface CoachArea {
  /** Unique across modes, e.g. `quiz:javascript:async`. */
  key: string;
  mode: CoachMode;
  label: string;
  /** Turns the area's own points into points of a 100-point attempt. */
  scale: number;
  /** Any order; the newest RECENT_PER_AREA are read. */
  results: AreaResult[];
  start: CoachStart;
  /** Quiz: the language's open mistakes, which a mistakes round replays. */
  mistakes?: { language: PracticeLanguage; count: number };
}

export interface WeighedArea extends CoachArea {
  /** Points of a 100-point attempt this area costs at the recent average. */
  pointsLost: number;
  /** The recent average, as a whole percent of the points on offer. */
  average: number;
  /** Results read. */
  considered: number;
  /** The newest of them. */
  lastAt: string;
}

export type CoachPick = { type: 'weak'; area: WeighedArea } | { type: 'untried'; mode: CoachMode };

const MODE_ORDER: CoachMode[] = ['quiz', 'code_review', 'system_design'];

/** Two costs this close are a tie: they differ only in floating point. */
const EPSILON = 1e-9;

/** The area at its recent average, or null when it has never been practised. */
export function weighArea(area: CoachArea): WeighedArea | null {
  const recent = [...area.results].sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_PER_AREA);
  if (recent.length === 0) return null;

  let weight = 1;
  let weights = 0;
  let lost = 0;
  let earned = 0;
  let offered = 0;
  for (const result of recent) {
    weights += weight;
    lost += weight * Math.max(0, result.maxPoints - result.points);
    earned += weight * result.points;
    offered += weight * result.maxPoints;
    weight *= RECENCY_DECAY;
  }

  return {
    ...area,
    pointsLost: (area.scale * lost) / weights,
    average: offered > 0 ? Math.round((earned / offered) * 100) : 0,
    considered: recent.length,
    lastAt: recent[0].at,
  };
}

/**
 * Practised areas that cost points, most first. A tie goes to the area
 * practised longest ago, then to the key, so the order never wobbles.
 */
export function rankWeakAreas(areas: CoachArea[]): WeighedArea[] {
  return areas
    .map(weighArea)
    .filter((area): area is WeighedArea => area !== null && area.pointsLost > EPSILON)
    .sort((a, b) => {
      if (Math.abs(a.pointsLost - b.pointsLost) > EPSILON) return b.pointsLost - a.pointsLost;
      return a.lastAt.localeCompare(b.lastAt) || a.key.localeCompare(b.key);
    });
}

/**
 * What the coach card shows: the weakest areas in the modes the account can
 * open, and once those run out, each of those modes it has never tried.
 */
export function coachPicks(areas: CoachArea[], available: CoachMode[], limit = COACH_PICKS): CoachPick[] {
  const open = areas.filter(area => available.includes(area.mode));
  const weak: CoachPick[] = rankWeakAreas(open).map(area => ({ type: 'weak', area }));
  const untried: CoachPick[] = MODE_ORDER.filter(
    mode => available.includes(mode) && !open.some(area => area.mode === mode && area.results.length > 0),
  ).map(mode => ({ type: 'untried', mode }));

  return [...weak, ...untried].slice(0, limit);
}

/** Every area the progress response describes, in the order it lists them. */
export function coachAreas(progress: PracticeProgress): CoachArea[] {
  const quiz = progress.quiz.languages.flatMap(language =>
    language.topics.map(
      (topic): CoachArea => ({
        key: `quiz:${language.key}:${topic.key}`,
        mode: 'quiz',
        label: `${language.label} · ${topic.label}`,
        scale: 100 / language.topics.length,
        results: topic.recent,
        start: { mode: 'quiz', language: language.key, topic: topic.key },
        mistakes: { language: language.key, count: language.openMistakes },
      }),
    ),
  );

  const codeReview = progress.codeReview.categories.map(
    (category): CoachArea => ({
      key: `code_review:${category.key}`,
      mode: 'code_review',
      label: category.label,
      scale: 1,
      results: category.recent,
      start: { mode: 'code_review', category: category.key },
    }),
  );

  const systemDesign = progress.systemDesign.traits.map(
    (trait): CoachArea => ({
      key: `system_design:${trait.key}`,
      mode: 'system_design',
      label: trait.label,
      scale: 1,
      results: trait.recent,
      start: { mode: 'system_design' },
    }),
  );

  return [...quiz, ...codeReview, ...systemDesign];
}
