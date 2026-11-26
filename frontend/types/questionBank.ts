/**
 * The admin's practice question bank (Admin · Question bank) and the user's
 * "Report this question". Shapes of /api/admin/practice/questions and
 * /api/practice/questions/{id}/report, which answer flat JSON.
 *
 * Unlike {@link QuizQuestion}, an AdminQuestion carries its key and the AI's
 * review notes: these routes are admin-only.
 */

import { PracticeDifficulty, PracticeKind, PracticeLanguage } from './practice';

/** Mirrors App\Enums\PracticeQuestionStatus. Users are only served `published`. */
export type QuestionStatus = 'draft' | 'published';

/** Mirrors App\Enums\PracticeQuestionSource. Seed rows are read-only here. */
export type QuestionSource = 'seed' | 'ai' | 'admin';

/** The quiz's key. Other kinds shape `answer` their own way. */
export interface QuizAnswerKey {
  choice: string | null;
}

/** The AI's one line per wrong option, for the admin reviewing a quiz draft. */
export interface QuizReviewNotes {
  distractors: { option: string; why: string }[];
}

export interface QuestionReport {
  id: number;
  reason: string;
  reportedAt: string | null;
}

/** AdminPracticeQuestionResource. */
export interface AdminQuestion {
  id: number;
  kind: PracticeKind;
  language: PracticeLanguage | null;
  topic: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  code: string | null;
  options: string[] | null;
  /** Shaped per kind: {choice} for the quiz. */
  answer: Record<string, unknown>;
  explanation: string;
  /** Shaped per kind: {distractors} for the quiz; null when there are none. */
  reviewNotes: Record<string, unknown> | null;
  status: QuestionStatus;
  source: QuestionSource;
  /** The seed file's id for a seed row; null otherwise. */
  externalId: string | null;
  attemptCount: number;
  /** Open reports; resolving clears them. */
  openReports: number;
  /** The open reports, oldest first. */
  reports: QuestionReport[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface QuestionFilters {
  kind?: PracticeKind | '';
  status?: QuestionStatus | '';
  language?: PracticeLanguage | '';
  topic?: string;
  source?: QuestionSource | '';
  /** Only questions with open reports. */
  reported?: boolean;
}

/** GET /api/admin/practice/questions. */
export interface QuestionBankPage {
  questions: AdminQuestion[];
  meta: { page: number; perPage: number; total: number; lastPage: number };
  /** The kinds the AI can draft. */
  generators: PracticeKind[];
}

/** POST /api/admin/practice/questions/generate. The quiz's fields; other kinds add their own. */
export interface GenerateDraftsInput {
  kind: PracticeKind;
  count: number;
  language?: PracticeLanguage;
  topic?: string;
  difficulty?: PracticeDifficulty;
}

/** A draft the checks refused, with why. `index` is its 1-based place in the AI's answer. */
export interface RejectedDraft {
  index: number;
  prompt: string | null;
  reasons: string[];
}

export interface GenerateDraftsResult {
  /** Saved as drafts, for review. */
  drafts: AdminQuestion[];
  rejected: RejectedDraft[];
}

/** PATCH: any content field, and/or status to publish or unpublish. */
export interface QuestionPatch {
  language?: PracticeLanguage | null;
  topic?: string;
  difficulty?: PracticeDifficulty;
  prompt?: string;
  code?: string | null;
  options?: string[];
  answer?: Record<string, unknown>;
  explanation?: string;
  reviewNotes?: Record<string, unknown> | null;
  status?: QuestionStatus;
}

/** DELETE: a question someone has answered is unpublished instead, and comes back. */
export interface DeleteQuestionResult {
  deleted: boolean;
  question: AdminQuestion | null;
}
