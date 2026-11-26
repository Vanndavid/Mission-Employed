import { describe, expect, it } from 'vitest';
import { ReviewedIssue } from '../types/codeReview';
import {
  commentsOnLine,
  EMPTY_DRAFT,
  issuesOnLine,
  lineTone,
  reviewDraftReducer,
  ReviewDraft,
  toSubmission,
} from './codeReview';

/**
 * The review being written (comments on lines, one editor open at a time)
 * and how a scored review is drawn over the code.
 */

const run = (...actions: Parameters<typeof reviewDraftReducer>[1][]): ReviewDraft =>
  actions.reduce(reviewDraftReducer, EMPTY_DRAFT);

const issue = (id: string, lines: [number, number], found: boolean): ReviewedIssue => ({
  id,
  lines,
  category: 'bug',
  severity: 2,
  summary: `${id} summary`,
  fix: `${id} fix`,
  found,
  comments: found ? [0] : [],
  fixVerdict: found ? 'yes' : null,
});

describe('reviewDraftReducer', () => {
  it('opens an editor on a line and saves the comment there', () => {
    const draft = run({ type: 'open', line: 7 }, { type: 'type', text: '  Off by one.  ' }, { type: 'save' });

    expect(draft.editing).toBeNull();
    expect(draft.comments).toEqual([{ id: 1, line: 7, body: 'Off by one.' }]);
  });

  it('will not save an empty comment', () => {
    const draft = run({ type: 'open', line: 3 }, { type: 'type', text: '   ' }, { type: 'save' });

    expect(draft.comments).toEqual([]);
    expect(draft.editing).toEqual({ line: 3, id: null, text: '   ' });
  });

  it('edits a saved comment in place and deletes one', () => {
    const saved = run(
      { type: 'open', line: 3 },
      { type: 'type', text: 'First' },
      { type: 'save' },
      { type: 'open', line: 9 },
      { type: 'type', text: 'Second' },
      { type: 'save' },
    );

    const edited = reviewDraftReducer(saved, { type: 'edit', id: 1 });
    expect(edited.editing).toEqual({ line: 3, id: 1, text: 'First' });

    const renamed = reviewDraftReducer(reviewDraftReducer(edited, { type: 'type', text: 'First, clearer' }), { type: 'save' });
    expect(renamed.comments).toEqual([
      { id: 1, line: 3, body: 'First, clearer' },
      { id: 2, line: 9, body: 'Second' },
    ]);

    expect(reviewDraftReducer(saved, { type: 'delete', id: 1 }).comments).toEqual([{ id: 2, line: 9, body: 'Second' }]);
  });

  it('cancels an editor without touching the saved comments', () => {
    const draft = run({ type: 'open', line: 3 }, { type: 'type', text: 'Kept' }, { type: 'save' }, { type: 'edit', id: 1 }, { type: 'type', text: 'Changed my mind' }, { type: 'cancel' });

    expect(draft.editing).toBeNull();
    expect(draft.comments).toEqual([{ id: 1, line: 3, body: 'Kept' }]);
  });

  it('starts again empty on reset', () => {
    const draft = run({ type: 'open', line: 3 }, { type: 'type', text: 'x' }, { type: 'save' }, { type: 'reset' });

    expect(draft).toEqual(EMPTY_DRAFT);
  });
});

describe('toSubmission', () => {
  it('sends the comments in line order, as line and body only', () => {
    const draft = run(
      { type: 'open', line: 12 },
      { type: 'type', text: 'Later' },
      { type: 'save' },
      { type: 'open', line: 4 },
      { type: 'type', text: 'Earlier' },
      { type: 'save' },
      { type: 'open', line: 12 },
      { type: 'type', text: 'Later, again' },
      { type: 'save' },
    );

    expect(toSubmission(draft.comments)).toEqual([
      { line: 4, body: 'Earlier' },
      { line: 12, body: 'Later' },
      { line: 12, body: 'Later, again' },
    ]);
  });
});

describe('commentsOnLine', () => {
  it('keeps the order the comments were written in', () => {
    const comments = [
      { id: 1, line: 5, body: 'a' },
      { id: 2, line: 6, body: 'b' },
      { id: 3, line: 5, body: 'c' },
    ];

    expect(commentsOnLine(comments, 5).map(c => c.body)).toEqual(['a', 'c']);
    expect(commentsOnLine(comments, 7)).toEqual([]);
  });
});

describe('lineTone', () => {
  const issues = [issue('found', [3, 5], true), issue('missed', [5, 8], false)];

  it('is green on a found issue, amber on a missed one, and nothing elsewhere', () => {
    expect(lineTone(issues, 3)).toBe('found');
    expect(lineTone(issues, 7)).toBe('missed');
    expect(lineTone(issues, 9)).toBeNull();
  });

  it('shows a line two issues share as missed, since something there was not found', () => {
    expect(lineTone(issues, 5)).toBe('missed');
    expect(issuesOnLine(issues, 5).map(i => i.id)).toEqual(['found', 'missed']);
  });
});
