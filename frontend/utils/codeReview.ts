/**
 * Code review practice, the parts with no React in them: the review being
 * written (comments on lines, with one editor open at a time) and how a
 * scored review is drawn over the code.
 */

import { PracticeDifficulty, PracticeLanguage } from '../types/practice';
import { CodeReviewCategory, FixVerdict, ReviewComment, ReviewedIssue } from '../types/codeReview';

/** A comment in the draft. `id` is local, only for editing and React keys. */
export interface DraftComment {
  id: number;
  line: number;
  body: string;
}

export interface ReviewDraft {
  comments: DraftComment[];
  /** The open editor: a new comment on `line` (id null), or an edit of one. */
  editing: { line: number; id: number | null; text: string } | null;
  nextId: number;
}

export type ReviewDraftAction =
  | { type: 'open'; line: number }
  | { type: 'edit'; id: number }
  | { type: 'type'; text: string }
  | { type: 'save' }
  | { type: 'cancel' }
  | { type: 'delete'; id: number }
  | { type: 'reset' };

export const EMPTY_DRAFT: ReviewDraft = { comments: [], editing: null, nextId: 1 };

export function reviewDraftReducer(draft: ReviewDraft, action: ReviewDraftAction): ReviewDraft {
  switch (action.type) {
    case 'open':
      return { ...draft, editing: { line: action.line, id: null, text: '' } };
    case 'edit': {
      const comment = draft.comments.find(c => c.id === action.id);
      return comment ? { ...draft, editing: { line: comment.line, id: comment.id, text: comment.body } } : draft;
    }
    case 'type':
      return draft.editing ? { ...draft, editing: { ...draft.editing, text: action.text } } : draft;
    case 'save': {
      const editing = draft.editing;
      const body = editing?.text.trim() ?? '';
      if (!editing || body === '') return draft;
      if (editing.id !== null) {
        return {
          ...draft,
          editing: null,
          comments: draft.comments.map(c => (c.id === editing.id ? { ...c, body } : c)),
        };
      }
      return {
        ...draft,
        editing: null,
        comments: [...draft.comments, { id: draft.nextId, line: editing.line, body }],
        nextId: draft.nextId + 1,
      };
    }
    case 'cancel':
      return { ...draft, editing: null };
    case 'delete':
      return {
        ...draft,
        comments: draft.comments.filter(c => c.id !== action.id),
        editing: draft.editing?.id === action.id ? null : draft.editing,
      };
    case 'reset':
      return EMPTY_DRAFT;
  }
}

/** What the server is sent: line order, then the order they were written. */
export function toSubmission(comments: DraftComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => a.line - b.line || a.id - b.id).map(({ line, body }) => ({ line, body }));
}

export function commentsOnLine<T extends { line: number }>(comments: T[], line: number): T[] {
  return comments.filter(c => c.line === line);
}

export function issuesOnLine(issues: ReviewedIssue[], line: number): ReviewedIssue[] {
  return issues.filter(issue => line >= issue.lines[0] && line <= issue.lines[1]);
}

/**
 * How a line of a scored review is highlighted. A line two issues share
 * reads as missed when either was, since something there went unnoticed.
 */
export function lineTone(issues: ReviewedIssue[], line: number): 'found' | 'missed' | null {
  const here = issuesOnLine(issues, line);
  if (here.length === 0) return null;
  return here.every(issue => issue.found) ? 'found' : 'missed';
}

export function lineRange([start, end]: [number, number]): string {
  return start === end ? `Line ${start}` : `Lines ${start}–${end}`;
}

export const LANGUAGES: { key: PracticeLanguage; label: string }[] = [
  { key: 'javascript', label: 'JavaScript' },
  { key: 'python', label: 'Python' },
  { key: 'java', label: 'Java' },
  { key: 'sql', label: 'SQL' },
];

export const DIFFICULTIES: PracticeDifficulty[] = ['easy', 'medium', 'hard'];

export function languageLabel(key: PracticeLanguage): string {
  return LANGUAGES.find(l => l.key === key)?.label ?? key;
}

export const CATEGORY_LABELS: Record<CodeReviewCategory, string> = {
  bug: 'Bug',
  security: 'Security',
  performance: 'Performance',
  concurrency: 'Concurrency',
  readability: 'Readability',
  testing: 'Testing',
};

export const SEVERITY_LABELS: Record<number, string> = { 1: 'Minor', 2: 'Major', 3: 'Serious' };

export const FIX_LABELS: Record<FixVerdict, string> = {
  yes: 'Your fix works',
  partial: 'Your fix is partly right',
  no: 'No working fix suggested',
};

export function verdictLine(score: number): string {
  if (score >= 90) return 'A thorough review.';
  if (score >= 70) return 'A strong review. See what slipped through below.';
  if (score >= 40) return 'Some good catches. The amber lines hide what was missed.';
  return 'Keep at it. Each missed issue below is worth learning.';
}
