/**
 * The admin's question editors, one per kind: an AdminQuestion into form
 * state and back into a PATCH. The PATCH carries the whole question, since
 * the server checks the whole question on every save. For the quiz the
 * review notes are left out, so the server keeps the AI's (and drops any
 * whose option was edited away).
 */

import { CodeReviewCategory } from '../types/codeReview';
import { PracticeDifficulty, PracticeLanguage } from '../types/practice';
import { AdminQuestion, PlantedIssue, QuestionPatch } from '../types/questionBank';
import { SystemDesignTraitKey } from '../types/systemDesign';

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

// Code review ---------------------------------------------------------------

/** Mirrors App\Enums\CodeReviewCategory, in its order. */
export const CODE_REVIEW_CATEGORIES: CodeReviewCategory[] = ['bug', 'security', 'performance', 'concurrency', 'readability', 'testing'];

/** CodeReviewItemValidator::MAX_ISSUES. */
export const MAX_PLANTED_ISSUES = 6;

export interface PlantedIssueForm {
  id: string;
  start: number;
  end: number;
  category: CodeReviewCategory | '';
  severity: number;
  summary: string;
  fix: string;
}

export interface CodeReviewForm {
  language: PracticeLanguage | '';
  /** Stored as the question's `topic`. */
  title: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  code: string;
  issues: PlantedIssueForm[];
  /** The takeaway shown after a review is scored. */
  explanation: string;
}

const isRange = (lines: unknown): lines is [number, number] =>
  Array.isArray(lines) && lines.length === 2 && lines.every(n => typeof n === 'number');

/** A snippet's planted issues, `answer.issues`; an entry that is not one is skipped. */
export function plantedIssues(question: AdminQuestion): PlantedIssue[] {
  const raw = question.answer?.issues;
  if (!Array.isArray(raw)) return [];

  return raw.filter((issue): issue is PlantedIssue => {
    const candidate = (issue ?? {}) as Partial<PlantedIssue>;
    return typeof candidate.id === 'string' && isRange(candidate.lines);
  });
}

export function toCodeReviewForm(question: AdminQuestion): CodeReviewForm {
  return {
    language: question.language ?? '',
    title: question.topic,
    difficulty: question.difficulty,
    prompt: question.prompt,
    code: question.code ?? '',
    issues: plantedIssues(question).map(issue => ({
      id: issue.id,
      start: issue.lines[0],
      end: issue.lines[1],
      category: issue.category ?? '',
      severity: issue.severity,
      summary: issue.summary ?? '',
      fix: issue.fix ?? '',
    })),
    explanation: question.explanation,
  };
}

export function toCodeReviewPatch(form: CodeReviewForm): QuestionPatch {
  return {
    language: form.language || null,
    topic: form.title,
    difficulty: form.difficulty,
    prompt: form.prompt,
    code: form.code,
    answer: {
      issues: form.issues.map(issue => ({
        id: issue.id,
        lines: [issue.start, issue.end],
        category: issue.category,
        severity: issue.severity,
        summary: issue.summary,
        fix: issue.fix,
      })),
    },
    explanation: form.explanation,
  };
}

/** A new planted issue, for the admin to fill in; the server checks it on Save. */
export function blankIssue(): PlantedIssueForm {
  return { id: '', start: 1, end: 1, category: 'bug', severity: 2, summary: '', fix: '' };
}

// System design -------------------------------------------------------------

/** Mirrors SystemDesignRubric::TRAITS: the traits a scenario has key points for, in rubric order. */
export const SYSTEM_DESIGN_TRAITS: { key: SystemDesignTraitKey; label: string }[] = [
  { key: 'requirements', label: 'Requirements and scope' },
  { key: 'estimation', label: 'Estimation' },
  { key: 'api_data_model', label: 'API and data model' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'scalability', label: 'Scalability' },
  { key: 'reliability', label: 'Reliability and trade-offs' },
  { key: 'communication', label: 'Communication' },
];

export interface SystemDesignForm {
  /** Stored as the question's `topic`. */
  title: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  /** One key point a line. */
  keyPoints: Record<SystemDesignTraitKey, string>;
  /** What the scenario tests, shown after scoring. */
  explanation: string;
}

/** A scenario's key points, `answer.keyPoints`, for every trait; a trait with none reads as []. */
export function scenarioKeyPoints(question: AdminQuestion): Record<SystemDesignTraitKey, string[]> {
  const raw = (question.answer?.keyPoints ?? {}) as Record<string, unknown>;

  return Object.fromEntries(
    SYSTEM_DESIGN_TRAITS.map(({ key }) => {
      const points = raw[key];
      return [key, Array.isArray(points) ? points.filter((p): p is string => typeof p === 'string') : []];
    }),
  ) as Record<SystemDesignTraitKey, string[]>;
}

export function toSystemDesignForm(question: AdminQuestion): SystemDesignForm {
  const keyPoints = scenarioKeyPoints(question);

  return {
    title: question.topic,
    difficulty: question.difficulty,
    prompt: question.prompt,
    keyPoints: Object.fromEntries(SYSTEM_DESIGN_TRAITS.map(({ key }) => [key, keyPoints[key].join('\n')])) as Record<
      SystemDesignTraitKey,
      string
    >,
    explanation: question.explanation,
  };
}

/** Every trait goes back, so the server checks the whole key; blank lines are not key points. */
export function toSystemDesignPatch(form: SystemDesignForm): QuestionPatch {
  return {
    topic: form.title,
    difficulty: form.difficulty,
    prompt: form.prompt,
    answer: {
      keyPoints: Object.fromEntries(
        SYSTEM_DESIGN_TRAITS.map(({ key }) => [
          key,
          form.keyPoints[key]
            .split('\n')
            .map(point => point.trim())
            .filter(point => point !== ''),
        ]),
      ),
    },
    explanation: form.explanation,
  };
}
