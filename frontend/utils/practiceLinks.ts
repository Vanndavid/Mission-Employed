/**
 * Where practice lives on Mission Control, and how a link starts a mode:
 * the coach's one-click starts travel in the mode's query string, and the
 * mode's route (components/PracticeModeRoutes.tsx) reads them back. The
 * paths match the mode tabs in utils/navTabs.ts.
 */

import { CodeReviewCategory } from '../types/codeReview';
import { PracticeKind, PracticeLanguage, QuizRoundTopic } from '../types/practice';
import { CATEGORY_LABELS, LANGUAGES } from './codeReview';
import { MISTAKES } from './quizRound';
import type { CoachStart } from './practiceCoach';

export const HISTORY_PATH = '/dashboard/history';

export const MODE_PATHS: Record<PracticeKind, string> = {
  quiz: '/dashboard/quiz',
  code_review: '/dashboard/code-review',
  system_design: '/dashboard/system-design',
};

export const MODE_LABELS: Record<PracticeKind, string> = {
  quiz: 'Quiz',
  code_review: 'Code review',
  system_design: 'System design',
};

export function attemptPath(id: number): string {
  return `${HISTORY_PATH}/${id}`;
}

export function startPath(start: CoachStart): string {
  switch (start.mode) {
    case 'quiz':
      return `${MODE_PATHS.quiz}?${new URLSearchParams({ language: start.language, topic: start.topic })}`;
    case 'code_review':
      return `${MODE_PATHS.code_review}?${new URLSearchParams({ category: start.category })}`;
    case 'system_design':
      return MODE_PATHS.system_design;
  }
}

/** A round of the language's open mistakes. */
export function mistakesPath(language: PracticeLanguage): string {
  return startPath({ mode: 'quiz', language, topic: MISTAKES });
}

export interface QuizLaunch {
  language: PracticeLanguage;
  topic: QuizRoundTopic;
}

/** The round a quiz link asks for, if it names a known language and a topic. */
export function readQuizLaunch(params: URLSearchParams): QuizLaunch | null {
  const language = LANGUAGES.find(l => l.key === params.get('language'))?.key;
  const topic = params.get('topic')?.trim();
  return language && topic ? { language, topic } : null;
}

/** The issue category a code review link asks to focus on, if it is one. */
export function readReviewCategory(params: URLSearchParams): CodeReviewCategory | null {
  const category = params.get('category');
  return category !== null && Object.keys(CATEGORY_LABELS).includes(category) ? (category as CodeReviewCategory) : null;
}
