import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { fetchNextSnippet, submitCodeReview } from '../services/codeReviewClient';
import { aiFailureMessage, ApiError, errorMessage, isAbortError } from '../services/http';
import { CodeReviewResult, CodeReviewSnippet, MarkedComment, NextSnippetResponse, ReviewedIssue } from '../types/codeReview';
import { PracticeDifficulty, PracticeLanguage } from '../types/practice';
import {
  CATEGORY_LABELS,
  commentsOnLine,
  DIFFICULTIES,
  DraftComment,
  EMPTY_DRAFT,
  FIX_LABELS,
  LANGUAGES,
  languageLabel,
  lineRange,
  lineTone,
  ReviewDraft,
  ReviewDraftAction,
  reviewDraftReducer,
  SEVERITY_LABELS,
  toSubmission,
  verdictLine,
} from '../utils/codeReview';
import { CodeSnippet } from './CodeSnippet';

/**
 * Mission Control's Code review mode: review a short snippet as you would a
 * pull request, leaving comments on lines, then submit. The server asks the
 * model which of the snippet's planted issues the comments identify and
 * computes the score itself; the planted issues never reach this screen
 * until the review is scored.
 *
 * Behind PremiumGate feature="code_review" in App.tsx. Each scored review is
 * one use; loading a snippet is free. The draft is the pure reducer in
 * utils/codeReview.ts.
 */
export function CodeReviewMode() {
  const { noteRefusal } = useSubscription();
  const [language, setLanguage] = useState<PracticeLanguage | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty | null>(null);
  const [next, setNext] = useState<NextSnippetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, dispatch] = useReducer(reviewDraftReducer, EMPTY_DRAFT);
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CodeReviewResult | null>(null);
  const loadController = useRef<AbortController | null>(null);
  // Read through a ref: a refusal re-reads the plan, which hands back a new
  // noteRefusal, and that must not reload the snippet and lose the draft.
  const noteRefusalRef = useRef(noteRefusal);
  noteRefusalRef.current = noteRefusal;

  const load = useCallback(
    async (exclude?: number) => {
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;

      setLoading(true);
      setLoadError(null);
      setSubmitError(null);
      setResult(null);
      setSummary('');
      dispatch({ type: 'reset' });
      try {
        const filter = exclude ? { language, difficulty, exclude } : { language, difficulty };
        setNext(await fetchNextSnippet(filter, controller.signal));
      } catch (cause) {
        if (isAbortError(cause)) return;
        noteRefusalRef.current(cause);
        setNext(null);
        setLoadError(aiFailureMessage(cause, 'Could not load a snippet to review.'));
      } finally {
        if (loadController.current === controller) setLoading(false);
      }
    },
    [language, difficulty],
  );

  // A new filter is a new load.
  useEffect(() => {
    void load();
    return () => loadController.current?.abort();
  }, [load]);

  const confirmDiscard = () =>
    result !== null || draft.comments.length === 0 || window.confirm('Throw away your comments on this snippet?');

  const snippet = result?.snippet ?? next?.snippet ?? null;

  const submit = async () => {
    if (!snippet || draft.comments.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      setResult(await submitCodeReview(snippet.id, toSubmission(draft.comments), summary));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isNotFound) {
        setSubmitError('This snippet has just been taken out of the bank, so it cannot be scored. Try another.');
      } else if (cause instanceof ApiError && cause.isValidation) {
        setSubmitError(errorMessage(cause, 'That review could not be sent.'));
      } else {
        noteRefusal(cause);
        setSubmitError(aiFailureMessage(cause, 'Could not score this review.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ReviewFilters
        language={language}
        difficulty={difficulty}
        next={next}
        onLanguage={key => confirmDiscard() && setLanguage(key)}
        onDifficulty={key => confirmDiscard() && setDifficulty(key)}
      />

      {loadError ? (
        <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
          {loadError}
        </p>
      ) : loading && !snippet ? (
        <p className="text-sm text-slate-400 italic animate-pulse">Finding a snippet to review…</p>
      ) : !snippet ? (
        <p className={`${card} p-6 text-sm text-slate-500 dark:text-slate-400`}>
          No snippets match these filters yet. Try another language or difficulty.
        </p>
      ) : result ? (
        <ReviewResult
          result={result}
          onNext={() => void load(result.snippet.id)}
          onRetry={() => {
            setResult(null);
            setSummary('');
            dispatch({ type: 'reset' });
          }}
        />
      ) : (
        <ReviewEditor
          snippet={snippet}
          reviewedBefore={next?.reviewedBefore ?? false}
          draft={draft}
          dispatch={dispatch}
          summary={summary}
          onSummary={setSummary}
          submitting={submitting}
          error={submitError}
          onSubmit={() => void submit()}
          onSkip={() => confirmDiscard() && void load(snippet.id)}
        />
      )}
    </div>
  );
}

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
    active
      ? 'bg-brand-600 border-brand-600 text-white'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400'
  }`;

function ReviewFilters({
  language,
  difficulty,
  next,
  onLanguage,
  onDifficulty,
}: {
  language: PracticeLanguage | null;
  difficulty: PracticeDifficulty | null;
  next: NextSnippetResponse | null;
  onLanguage: (key: PracticeLanguage | null) => void;
  onDifficulty: (key: PracticeDifficulty | null) => void;
}) {
  return (
    <section className={`${card} p-6`}>
      <div className="max-w-2xl">
        <h3 className="text-xl font-bold flex items-center">
          <span className="mr-2">🔍</span> Code review
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Review a short snippet the way you would a pull request: click a line number to comment on it. Known issues
          are planted in every snippet. The AI checks which of them your comments found, and the score is worked out
          from that: most for serious issues, some for the right fix, and a little for not padding the review.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Language" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={language === null} onClick={() => onLanguage(null)} className={pill(language === null)}>
            Any language
          </button>
          {LANGUAGES.map(l => (
            <button key={l.key} type="button" aria-pressed={language === l.key} onClick={() => onLanguage(l.key)} className={pill(language === l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={difficulty === null} onClick={() => onDifficulty(null)} className={pill(difficulty === null)}>
            Any level
          </button>
          {DIFFICULTIES.map(d => (
            <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => onDifficulty(d)} className={`${pill(difficulty === d)} capitalize`}>
              {d}
            </button>
          ))}
        </div>
        {next && next.total > 0 && (
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {next.unreviewed} of {next.total} not reviewed yet
          </span>
        )}
      </div>
    </section>
  );
}

function SnippetHeader({ snippet, badge }: { snippet: CodeReviewSnippet; badge?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {languageLabel(snippet.language)} · <span className="capitalize">{snippet.difficulty}</span>
        {badge ? ` · ${badge}` : ''}
      </p>
      <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">{snippet.title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{snippet.prompt}</p>
    </div>
  );
}

function ReviewEditor({
  snippet,
  reviewedBefore,
  draft,
  dispatch,
  summary,
  onSummary,
  submitting,
  error,
  onSubmit,
  onSkip,
}: {
  snippet: CodeReviewSnippet;
  reviewedBefore: boolean;
  draft: ReviewDraft;
  dispatch: React.Dispatch<ReviewDraftAction>;
  summary: string;
  onSummary: (text: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const editing = draft.editing;
  const count = draft.comments.length;

  const renderAfterLine = (line: number) => {
    const saved = commentsOnLine(draft.comments, line);
    const editorHere = editing !== null && editing.line === line && editing.id === null;
    if (saved.length === 0 && !editorHere) return null;
    return (
      <span className="block space-y-2 py-1">
        {saved.map(comment =>
          editing?.id === comment.id ? (
            <CommentEditor key={comment.id} line={line} text={editing.text} dispatch={dispatch} />
          ) : (
            <SavedComment key={comment.id} comment={comment} dispatch={dispatch} disabled={submitting} />
          ),
        )}
        {editorHere && <CommentEditor line={line} text={editing.text} dispatch={dispatch} />}
      </span>
    );
  };

  return (
    <section className={`${card} p-5 sm:p-8 space-y-5`}>
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SnippetHeader snippet={snippet} badge={reviewedBefore ? 'Reviewed before' : undefined} />
        </div>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="shrink-0 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-brand-400 disabled:opacity-50"
        >
          Another snippet
        </button>
      </div>

      <CodeSnippet
        code={snippet.code}
        label="Snippet under review"
        wrap
        onLineClick={submitting ? undefined : line => dispatch({ type: 'open', line })}
        lineActionLabel={line => `Comment on line ${line}`}
        lineClassName={line => (commentsOnLine(draft.comments, line).length > 0 ? 'bg-brand-500/10' : undefined)}
        renderAfterLine={renderAfterLine}
      />

      <label className="block">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Overall summary (optional)</span>
        <textarea
          value={summary}
          onChange={e => onSummary(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="What you would say at the top of the pull request. Findings count only as line comments."
          className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {editing
            ? 'Save or cancel the open comment to submit.'
            : count === 0
              ? 'Click a line number to leave your first comment.'
              : `${count} ${count === 1 ? 'comment' : 'comments'}. Each scored review is one use of your plan.`}
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={count === 0 || editing !== null || submitting}
          className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {submitting ? 'Checking your review…' : 'Submit review'}
        </button>
      </div>
    </section>
  );
}

function CommentEditor({ line, text, dispatch }: { line: number; text: string; dispatch: React.Dispatch<ReviewDraftAction> }) {
  return (
    <span className="block rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 sm:p-3 border border-brand-400">
      <textarea
        aria-label={`Comment on line ${line}`}
        autoFocus
        value={text}
        rows={3}
        maxLength={2000}
        onChange={e => dispatch({ type: 'type', text: e.target.value })}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            dispatch({ type: 'cancel' });
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            dispatch({ type: 'save' });
          }
        }}
        placeholder="What is wrong here, and how would you fix it?"
        className="block w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm"
      />
      <span className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={text.trim() === ''}
          onClick={() => dispatch({ type: 'save' })}
          className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold disabled:opacity-50"
        >
          Save comment
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'cancel' })}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Cancel
        </button>
        <span className="hidden sm:inline ml-auto text-[11px] text-slate-400">Ctrl+Enter to save, Esc to cancel</span>
      </span>
    </span>
  );
}

function SavedComment({
  comment,
  dispatch,
  disabled,
}: {
  comment: DraftComment;
  dispatch: React.Dispatch<ReviewDraftAction>;
  disabled: boolean;
}) {
  return (
    <span className="block rounded-lg bg-slate-800 border border-slate-700 p-2 sm:p-3 text-slate-100">
      <span className="block whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.body}</span>
      <span className="mt-1 flex gap-3 text-xs">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Edit comment on line ${comment.line}`}
          onClick={() => dispatch({ type: 'edit', id: comment.id })}
          className="font-bold text-brand-300 hover:text-brand-200 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Delete comment on line ${comment.line}`}
          onClick={() => dispatch({ type: 'delete', id: comment.id })}
          className="font-bold text-slate-400 hover:text-rose-300 disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </span>
  );
}

const TONE_ROW = { found: 'bg-emerald-500/20', missed: 'bg-amber-500/20' } as const;

function ReviewResult({ result, onNext, onRetry }: { result: CodeReviewResult; onNext: () => void; onRetry: () => void }) {
  const { breakdown, issues } = result;
  const issueNumber = (id: string) => issues.findIndex(issue => issue.id === id) + 1;

  const renderAfterLine = (line: number) => {
    const comments = commentsOnLine(
      result.comments.map((comment, index) => ({ ...comment, index })),
      line,
    );
    const ending = issues.filter(issue => issue.lines[1] === line);
    if (comments.length === 0 && ending.length === 0) return null;
    return (
      <span className="block space-y-2 py-1">
        {comments.map(comment => (
          <MarkedCommentView key={comment.index} comment={comment} issueNumber={issueNumber} />
        ))}
        {ending.map(issue => (
          <IssueNote key={issue.id} issue={issue} number={issueNumber(issue.id)} />
        ))}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <section className={`${card} p-5 sm:p-8`}>
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <SnippetHeader snippet={result.snippet} />
          </div>
          <div className="text-center shrink-0">
            <p className="text-5xl font-bold text-slate-900 dark:text-slate-50">
              <span>{result.score}</span>
              <span className="text-xl text-slate-400"> / {result.maxScore}</span>
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
              Found {breakdown.detection.found} of {breakdown.detection.total} planted issues
            </p>
          </div>
        </div>
        <p className="mt-4 text-slate-600 dark:text-slate-300">{verdictLine(result.score)}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <ScoreBar
            label="Issues found"
            points={breakdown.detection.points}
            max={breakdown.detection.max}
            detail={`${breakdown.detection.severityFound} of ${breakdown.detection.severityTotal} severity points: serious issues weigh most.`}
          />
          <ScoreBar label="Fixes" points={breakdown.fixes.points} max={breakdown.fixes.max} detail="Whether the fixes you suggested would work." />
          <ScoreBar
            label="Precision"
            points={breakdown.precision.points}
            max={breakdown.precision.max}
            detail={`${breakdown.precision.useful} of ${breakdown.precision.comments} comments found an issue or made a valid point.`}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={onNext} className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold">
            Next snippet
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-brand-400"
          >
            Review this one again
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">The planted issues on the code</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/40 align-middle mr-1" /> found
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/40 align-middle ml-4 mr-1" /> missed
        </p>
        <CodeSnippet
          code={result.snippet.code}
          label="Reviewed snippet"
          wrap
          lineClassName={line => {
            const tone = lineTone(issues, line);
            return tone ? TONE_ROW[tone] : undefined;
          }}
          renderAfterLine={renderAfterLine}
        />
      </section>

      {result.bonus.length > 0 && (
        <section className={`${card} p-5 space-y-2`}>
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Valid points beyond the planted issues</h3>
          <ul className="space-y-2">
            {result.bonus.map(bonus => (
              <li key={bonus.comment} className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-bold">Line {result.comments[bonus.comment]?.line}:</span> {result.comments[bonus.comment]?.body}
                {bonus.note && <span className="block text-sky-700 dark:text-sky-300">{bonus.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.takeaway && (
        <section className={`${card} p-5`}>
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Takeaway</h3>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.takeaway}</p>
        </section>
      )}

      <details className="text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer font-bold">How this was scored</summary>
        <p className="mt-2 leading-relaxed max-w-3xl">
          The AI only decides which of your comments identify which planted issue, and whether your fix would work.
          The score is then computed: {breakdown.detection.max} points for the issues found, weighted by severity;{' '}
          {breakdown.fixes.max} for the fixes (a partial fix earns half); {breakdown.precision.max} for the share of
          your comments that found something, so a review padded with guesses scores lower. Rubric {result.rubricVersion}.
        </p>
      </details>
    </div>
  );
}

function ScoreBar({ label, points, max, detail }: { label: string; points: number; max: number; detail: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-sm font-bold tabular-nums text-brand-600 dark:text-brand-400">{`${points} / ${max}`}</span>
      </div>
      <div className="mt-1.5 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500" style={{ width: `${max > 0 ? (points / max) * 100 : 0}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function MarkedCommentView({
  comment,
  issueNumber,
}: {
  comment: MarkedComment & { index: number };
  issueNumber: (id: string) => number;
}) {
  const found = comment.issues.length > 0;
  const tone = found
    ? 'border-emerald-500/60 bg-emerald-950/40'
    : comment.bonus
      ? 'border-sky-500/60 bg-sky-950/40'
      : 'border-slate-700 bg-slate-800';
  return (
    <span className={`block rounded-lg border p-2 sm:p-3 text-slate-100 ${tone}`}>
      <span className="block whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.body}</span>
      <span className="mt-1 block text-xs font-bold">
        {found ? (
          <span className="text-emerald-300">✓ Found planted issue {comment.issues.map(id => `#${issueNumber(id)}`).join(' and ')}</span>
        ) : comment.bonus ? (
          <span className="text-sky-300">★ A valid point{comment.note ? `: ${comment.note}` : ''}</span>
        ) : (
          <span className="text-slate-400">Matched no planted issue</span>
        )}
      </span>
    </span>
  );
}

function IssueNote({ issue, number }: { issue: ReviewedIssue; number: number }) {
  return (
    <span
      className={`block rounded-lg border-l-4 p-2 sm:p-3 ${
        issue.found ? 'border-emerald-400 bg-emerald-950/50' : 'border-amber-400 bg-amber-950/50'
      }`}
    >
      <span className={`block text-xs font-bold uppercase tracking-widest ${issue.found ? 'text-emerald-300' : 'text-amber-300'}`}>
        #{number} {issue.found ? 'Found' : 'Missed'} · {CATEGORY_LABELS[issue.category]} · {SEVERITY_LABELS[issue.severity] ?? issue.severity} ·{' '}
        {lineRange(issue.lines)}
      </span>
      <span className="mt-1 block text-slate-100">{issue.summary}</span>
      <span className="mt-1 block text-slate-300">
        <span className="font-bold">Fix: </span>
        {issue.fix}
      </span>
      {issue.fixVerdict && <span className="mt-1 block text-xs font-bold text-slate-300">{FIX_LABELS[issue.fixVerdict]}</span>}
    </span>
  );
}
