/**
 * Practice modes on Mission Control that share the question bank: the quiz,
 * code review (types/codeReview.ts) and system design (types/systemDesign.ts).
 * Shapes of /api/practice/*, which answer flat JSON (no `data` envelope).
 */

/** Mirrors App\Enums\PracticeKind. Every kind is served. */
export type PracticeKind = 'quiz' | 'code_review' | 'system_design';

/** Mirrors App\Enums\PracticeLanguage. Labels and topics come from the catalog. */
export type PracticeLanguage = 'javascript' | 'python' | 'java' | 'sql';

/** Mirrors PracticeQuestion::DIFFICULTIES. */
export type PracticeDifficulty = 'easy' | 'medium' | 'hard';

/** A round drills one topic (its key), mixes every topic, or replays open mistakes. */
export type QuizRoundTopic = string;

export interface QuizTopic {
  key: string;
  label: string;
  /** Published questions in this topic. */
  questionCount: number;
}

export interface QuizLanguage {
  key: PracticeLanguage;
  label: string;
  questionCount: number;
  topics: QuizTopic[];
}

/** GET /api/practice/quiz/catalog. */
export interface QuizCatalog {
  languages: QuizLanguage[];
}

/**
 * A question as it is served: options in a random order, and never the
 * answer or the explanation. Those arrive in a {@link QuizVerdict}.
 */
export interface QuizQuestion {
  id: number;
  topic: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  /** The snippet the question is about, if any. */
  code: string | null;
  options: string[];
}

/** POST /api/practice/quiz/rounds. */
export interface QuizRoundResponse {
  language: PracticeLanguage;
  topic: QuizRoundTopic;
  /** Up to ten; empty when there is nothing to serve (no open mistakes, say). */
  questions: QuizQuestion[];
}

/** POST /api/practice/quiz/answers: the server's verdict on one answer. */
export interface QuizVerdict {
  correct: boolean;
  /** The right option's text. */
  answer: string;
  explanation: string;
}

export interface QuizTally {
  /** Every answer given, right or wrong. */
  answered: number;
  correct: number;
  /** Whole percent; null before anything has been answered. */
  accuracy: number | null;
  /** Questions whose latest answer was wrong. */
  openMistakes: number;
}

export interface QuizTopicProgress extends QuizTally {
  key: string;
  label: string;
}

/** GET /api/practice/quiz/progress?language=. */
export interface QuizProgress extends QuizTally {
  language: PracticeLanguage;
  topics: QuizTopicProgress[];
}
