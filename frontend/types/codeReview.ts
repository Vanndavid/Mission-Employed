/**
 * Code review practice on Mission Control: review a snippet like a pull
 * request, and the server scores the comments against the issues planted in
 * it. Shapes of /api/practice/code-review/*, which answer flat JSON.
 */

import { PracticeDifficulty, PracticeLanguage } from './practice';

/** Mirrors App\Enums\CodeReviewCategory. */
export type CodeReviewCategory = 'bug' | 'security' | 'performance' | 'concurrency' | 'readability' | 'testing';

/** How good the fix a review suggested for a found issue is. */
export type FixVerdict = 'yes' | 'partial' | 'no';

/** A snippet as it is served: never its planted issues or takeaway. */
export interface CodeReviewSnippet {
  id: number;
  language: PracticeLanguage;
  title: string;
  difficulty: PracticeDifficulty;
  /** What the code is meant to do. */
  prompt: string;
  code: string;
}

/** GET /api/practice/code-review/next. */
export interface NextSnippetResponse {
  /** Null when nothing published matches the filter. */
  snippet: CodeReviewSnippet | null;
  /** Whether this user has reviewed the snippet served before. */
  reviewedBefore: boolean;
  /** Published snippets matching the filter. */
  total: number;
  /** Of those, how many this user has never reviewed. */
  unreviewed: number;
}

export interface NextSnippetFilter {
  language?: PracticeLanguage | null;
  difficulty?: PracticeDifficulty | null;
  /** The snippet on screen, so "another" is another one. */
  exclude?: number | null;
}

/** A comment on one line, 1-based, as the user writes it. */
export interface ReviewComment {
  line: number;
  body: string;
}

/** A planted issue, revealed once a review is scored. */
export interface ReviewedIssue {
  id: string;
  /** 1-based and inclusive. */
  lines: [number, number];
  category: CodeReviewCategory;
  /** 1 (minor) to 3 (serious). */
  severity: number;
  summary: string;
  fix: string;
  found: boolean;
  /** Indexes into the review's comments that found it. */
  comments: number[];
  /** Null when it was not found. */
  fixVerdict: FixVerdict | null;
}

/** A comment that found no planted issue but makes a valid point. */
export interface BonusFinding {
  comment: number;
  note: string;
}

/** One of the user's comments, marked with what it found. */
export interface MarkedComment extends ReviewComment {
  /** Ids of the planted issues it identified. */
  issues: string[];
  /** Judged a valid point outside the planted list. */
  bonus: boolean;
  note: string | null;
}

export interface ScoreBreakdown {
  detection: { points: number; max: number; found: number; total: number; severityFound: number; severityTotal: number };
  fixes: { points: number; max: number };
  precision: { points: number; max: number; useful: number; comments: number };
}

/**
 * POST /api/practice/code-review/{id}/reviews, and
 * GET /api/practice/code-review/reviews/{id} for one read back.
 */
export interface CodeReviewResult {
  /** The stored attempt's id. */
  id: number;
  snippet: CodeReviewSnippet;
  score: number;
  maxScore: number;
  rubricVersion: string;
  breakdown: ScoreBreakdown;
  issues: ReviewedIssue[];
  bonus: BonusFinding[];
  comments: MarkedComment[];
  summary: string | null;
  /** What a strong review of this snippet focuses on. */
  takeaway: string | null;
  createdAt: string;
}
