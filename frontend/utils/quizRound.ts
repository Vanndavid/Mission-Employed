import { PracticeLanguage, QuizQuestion, QuizRoundTopic, QuizTopic, QuizVerdict } from '../types/practice';

/**
 * A quiz round, as a pure reducer, after Eleph's Grammar Sprint
 * (src/features/grammar/lib/grammarGame.ts) with one difference: the answer
 * key is on the server. The questions arrive without answers, so choosing an
 * option only marks the question as being checked, and the verdict (right or
 * wrong, the answer and the explanation) comes back from
 * POST /api/practice/quiz/answers as its own action.
 *
 * Progress is not kept here: every answer is stored on the account, and the
 * server works out mistakes and accuracy from those. No day streaks; they
 * were deleted from this product.
 */

/** The server's round size, for copy. */
export const ROUND_SIZE = 10;

/** The optional per-question timer. Running out answers with null. */
export const SECONDS_PER_QUESTION = 20;

/** Every topic of the language. */
export const MIXED = 'mixed';

/** Only the user's open mistakes: questions whose latest answer was wrong. */
export const MISTAKES = 'mistakes';

export interface AnswerRecord extends QuizVerdict {
  question: QuizQuestion;
  /** null when the timer ran out. */
  choice: string | null;
}

export interface QuizRound {
  language: PracticeLanguage;
  topic: QuizRoundTopic;
  questions: QuizQuestion[];
  index: number;
  /** undefined while the question is open; null when its timer ran out. */
  choice: string | null | undefined;
  /** The choice is with the server and its verdict has not come back. */
  checking: boolean;
  /** The verdict on the question on screen, once it is in. */
  verdict: QuizVerdict | null;
  answers: AnswerRecord[];
  timed: boolean;
  finished: boolean;
  /** Why the last answer could not be checked. The question is open again. */
  error: string | null;
}

export type QuizRoundAction =
  | { type: 'start'; language: PracticeLanguage; topic: QuizRoundTopic; questions: QuizQuestion[]; timed: boolean }
  | { type: 'choose'; choice: string | null }
  | { type: 'verdict'; questionId: number; verdict: QuizVerdict }
  | { type: 'failed'; questionId: number; message: string }
  /** The server no longer serves the question (an admin unpublished it): skip it. */
  | { type: 'drop'; questionId: number }
  | { type: 'next' }
  | { type: 'quit' };

function current(round: QuizRound): QuizQuestion | undefined {
  return round.questions[round.index];
}

/** The question on screen is waiting for a choice. */
export function isOpen(round: QuizRound): boolean {
  return !round.finished && round.choice === undefined && !round.checking;
}

export function quizRoundReducer(state: QuizRound | null, action: QuizRoundAction): QuizRound | null {
  if (action.type === 'start') {
    if (action.questions.length === 0) return state;
    return {
      language: action.language,
      topic: action.topic,
      questions: action.questions,
      index: 0,
      choice: undefined,
      checking: false,
      verdict: null,
      answers: [],
      timed: action.timed,
      finished: false,
      error: null,
    };
  }

  if (action.type === 'quit' || state === null) return null;

  const round = state;
  const question = current(round);

  switch (action.type) {
    case 'choose':
      if (!isOpen(round)) return round;
      return { ...round, choice: action.choice, checking: true, error: null };

    case 'verdict':
      if (!round.checking || question?.id !== action.questionId || round.choice === undefined) return round;
      return {
        ...round,
        checking: false,
        verdict: action.verdict,
        answers: [...round.answers, { question, choice: round.choice, ...action.verdict }],
      };

    case 'failed':
      if (!round.checking || question?.id !== action.questionId) return round;
      return { ...round, choice: undefined, checking: false, error: action.message };

    case 'drop': {
      if (round.finished || question?.id !== action.questionId) return round;
      const questions = round.questions.filter(q => q.id !== action.questionId);
      const reset = { choice: undefined, checking: false, verdict: null, error: null };
      if (round.index < questions.length) return { ...round, ...reset, questions };
      return round.answers.length > 0 ? { ...round, ...reset, questions, finished: true } : null;
    }

    case 'next':
      if (round.finished || round.verdict === null) return round;
      if (round.index + 1 < round.questions.length) {
        return { ...round, index: round.index + 1, choice: undefined, verdict: null, error: null };
      }
      return { ...round, finished: true };
  }
}

export function roundScore(round: Pick<QuizRound, 'answers'>): number {
  return round.answers.filter(a => a.correct).length;
}

/** The questions answered wrongly (or not in time) this round, in order. */
export function missedQuestions(round: Pick<QuizRound, 'answers'>): QuizQuestion[] {
  return round.answers.filter(a => !a.correct).map(a => a.question);
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * "Retry mistakes" at the end of a round: the questions missed in it, with
 * their options in a new order. Played locally from what is already on
 * screen; each answer is still checked by the server.
 */
export function retryQuestions(round: Pick<QuizRound, 'answers'>, random: () => number = Math.random): QuizQuestion[] {
  return missedQuestions(round).map(q => ({ ...q, options: shuffle(q.options, random) }));
}

const LETTERS = ['a', 'b', 'c', 'd'];

/** Keys 1-4 or A-D pick an option; anything else is not an answer. */
export function optionIndexForKey(key: string, optionCount: number): number | null {
  const k = key.toLowerCase();
  const index = /^[1-4]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
  return index >= 0 && index < optionCount ? index : null;
}

/** The letter shown beside an option. */
export function optionLetter(index: number): string {
  return LETTERS[index]?.toUpperCase() ?? String(index + 1);
}

export function roundLabel(topic: QuizRoundTopic, topics: QuizTopic[]): string {
  if (topic === MIXED) return 'Mixed round';
  if (topic === MISTAKES) return 'Your mistakes';
  return topics.find(t => t.key === topic)?.label ?? topic;
}
