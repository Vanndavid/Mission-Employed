/**
 * Practice progress and history across the modes that share the question
 * bank: shapes of GET /api/practice/progress and /api/practice/attempts,
 * which answer flat JSON (no `data` envelope). Worked out from stored
 * attempts on the server every time; Problems keeps its own history in
 * coding_attempts.
 */

import { CodeReviewCategory, CodeReviewResult } from './codeReview';
import { PracticeDifficulty, PracticeKind, PracticeLanguage } from './practice';
import { SystemDesignReport, SystemDesignRubric, SystemDesignScenario, SystemDesignSections, SystemDesignTraitKey } from './systemDesign';

/**
 * One scored result in an area: the points the area was worth in that
 * attempt and how many it earned. A quiz answer is 1 or 0 of 1; a code
 * review category is the detection points its planted issues carried in
 * that review; a system design trait is its points of its weight.
 */
export interface AreaResult {
  at: string;
  points: number;
  maxPoints: number;
}

/** Every mode's totals over the window. */
export interface ModeSummary {
  kind: PracticeKind;
  /** Attempts in the window. */
  attempts: number;
  /** Mean score as a whole percent over the window; null with none. */
  averageScore: number | null;
  /** The latest attempt ever, inside the window or not. */
  lastAttemptAt: string | null;
}

export interface QuizTopicProgressSummary {
  key: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  openMistakes: number;
  /** Newest first, up to ten, however old. */
  recent: AreaResult[];
}

export interface QuizLanguageProgressSummary {
  key: PracticeLanguage;
  label: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  openMistakes: number;
  topics: QuizTopicProgressSummary[];
}

export interface CodeReviewCategoryProgress {
  key: CodeReviewCategory;
  label: string;
  /** Planted issues of this category in reviews in the window. */
  planted: number;
  found: number;
  foundRate: number | null;
  recent: AreaResult[];
}

export interface SystemDesignTraitProgress {
  key: SystemDesignTraitKey;
  label: string;
  /** The trait's weight out of 100. */
  maxPoints: number;
  /** Designs in the window that rated it. */
  attempts: number;
  averagePoints: number | null;
  /** averagePoints as a whole percent of maxPoints. */
  average: number | null;
  recent: AreaResult[];
}

/** GET /api/practice/progress. */
export interface PracticeProgress {
  windowDays: number;
  since: string;
  quiz: ModeSummary & { openMistakes: number; languages: QuizLanguageProgressSummary[] };
  codeReview: ModeSummary & { categories: CodeReviewCategoryProgress[] };
  systemDesign: ModeSummary & { traits: SystemDesignTraitProgress[] };
}

/** A line of history: how an attempt went, never its answer. */
export interface PracticeAttemptSummary {
  id: number;
  kind: PracticeKind;
  /** The quiz question's prompt, or the snippet's or scenario's title. */
  title: string;
  language: PracticeLanguage | null;
  /** Quiz only. */
  topic: string | null;
  topicLabel: string | null;
  difficulty: PracticeDifficulty;
  score: number;
  maxScore: number;
  /** Quiz only: right or wrong. */
  correct: boolean | null;
  createdAt: string;
}

/** GET /api/practice/attempts?kind=&page=. */
export interface PracticeAttemptPage {
  attempts: PracticeAttemptSummary[];
  meta: { page: number; perPage: number; total: number; lastPage: number };
}

/** A quiz answer read back: the question, what was chosen, and what it was told. */
export interface QuizAttemptResult {
  question: {
    id: number;
    language: PracticeLanguage;
    topic: string;
    topicLabel: string;
    difficulty: PracticeDifficulty;
    prompt: string;
    code: string | null;
    /** In the bank's order. */
    options: string[];
    /** False once an admin has taken it out of the bank. */
    published: boolean;
  };
  /** Null when the timer ran out. */
  choice: string | null;
  correct: boolean;
  answer: string | null;
  explanation: string;
}

export interface SystemDesignAttemptResult {
  scenario: SystemDesignScenario;
  sections: SystemDesignSections;
  report: SystemDesignReport;
  rubric: SystemDesignRubric;
}

interface AttemptDetailBase {
  id: number;
  score: number;
  maxScore: number;
  correct: boolean | null;
  rubricVersion: string | null;
  createdAt: string;
}

/** GET /api/practice/attempts/{id}: `result` is what that mode's result screen draws. */
export type PracticeAttemptDetail =
  | (AttemptDetailBase & { kind: 'quiz'; result: QuizAttemptResult })
  | (AttemptDetailBase & { kind: 'code_review'; result: CodeReviewResult })
  | (AttemptDetailBase & { kind: 'system_design'; result: SystemDesignAttemptResult });
