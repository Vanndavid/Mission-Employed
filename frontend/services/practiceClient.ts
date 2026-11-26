/**
 * Practice modes on Mission Control. Flat responses, no `data` envelope.
 *
 * The quiz is free on every plan and never metered: no route here names a
 * plan feature, so no plan refusal can come back from it.
 */

import { PracticeLanguage, QuizCatalog, QuizProgress, QuizRoundResponse, QuizRoundTopic, QuizVerdict } from '../types/practice';
import { apiRequest } from './http';

export async function fetchQuizCatalog(signal?: AbortSignal): Promise<QuizCatalog> {
  return apiRequest<QuizCatalog>('/practice/quiz/catalog', { signal });
}

/** Up to ten questions, without their answers. */
export async function startQuizRound(language: PracticeLanguage, topic: QuizRoundTopic): Promise<QuizRoundResponse> {
  return apiRequest<QuizRoundResponse>('/practice/quiz/rounds', { method: 'POST', body: { language, topic } });
}

/**
 * Score one answer on the server, which stores it. `choice` is the option's
 * text, or null when the timer ran out. 404 when the question is no longer
 * published.
 */
export async function answerQuizQuestion(questionId: number, choice: string | null): Promise<QuizVerdict> {
  return apiRequest<QuizVerdict>('/practice/quiz/answers', { method: 'POST', body: { questionId, choice } });
}

export async function fetchQuizProgress(language: PracticeLanguage, signal?: AbortSignal): Promise<QuizProgress> {
  return apiRequest<QuizProgress>(`/practice/quiz/progress?language=${encodeURIComponent(language)}`, { signal });
}
