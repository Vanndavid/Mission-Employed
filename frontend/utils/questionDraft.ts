/**
 * The admin's quiz question editor: an AdminQuestion into form state and
 * back into a PATCH. The PATCH carries the whole question, since the server
 * checks the whole question on every save; the review notes are left out,
 * so the server keeps the AI's (and drops any whose option was edited away).
 */

import { PracticeDifficulty, PracticeLanguage } from '../types/practice';
import { AdminQuestion, QuestionPatch } from '../types/questionBank';

export const OPTION_COUNT = 4;

export interface QuizForm {
  language: PracticeLanguage | '';
  topic: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  code: string;
  options: string[];
  /** Which option is the key; null when the stored key matches none. */
  answerIndex: number | null;
  explanation: string;
}

/** The quiz's key, `answer.choice`. */
export function quizAnswer(question: AdminQuestion): string | null {
  const choice = question.answer?.choice;
  return typeof choice === 'string' ? choice : null;
}

export function toQuizForm(question: AdminQuestion): QuizForm {
  const options = Array.from({ length: OPTION_COUNT }, (_, i) => question.options?.[i] ?? '');
  const answer = quizAnswer(question);
  const index = answer === null ? -1 : options.indexOf(answer);

  return {
    language: question.language ?? '',
    topic: question.topic,
    difficulty: question.difficulty,
    prompt: question.prompt,
    code: question.code ?? '',
    options,
    answerIndex: index >= 0 ? index : null,
    explanation: question.explanation,
  };
}

export function toQuizPatch(form: QuizForm): QuestionPatch {
  return {
    language: form.language || null,
    topic: form.topic,
    difficulty: form.difficulty,
    prompt: form.prompt,
    code: form.code.trim() === '' ? null : form.code,
    options: form.options,
    answer: { choice: form.answerIndex === null ? null : form.options[form.answerIndex] },
    explanation: form.explanation,
  };
}

export interface QuizNote {
  option: string;
  why: string;
  /** The AI explained why its own answer is wrong: check the key. */
  onAnswer: boolean;
}

/** The AI's one line per wrong option, from `reviewNotes.distractors`. */
export function quizNotes(question: AdminQuestion): QuizNote[] {
  const raw = (question.reviewNotes as { distractors?: unknown } | null)?.distractors;
  if (!Array.isArray(raw)) return [];

  const answer = quizAnswer(question);
  return raw.flatMap(note => {
    const { option, why } = (note ?? {}) as { option?: unknown; why?: unknown };
    return typeof option === 'string' && typeof why === 'string' ? [{ option, why, onAnswer: option === answer }] : [];
  });
}
