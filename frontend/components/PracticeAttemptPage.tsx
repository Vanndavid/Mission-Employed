import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, errorMessage, isAbortError } from '../services/http';
import { fetchPracticeAttempt } from '../services/practiceHistoryClient';
import { PracticeAttemptDetail, QuizAttemptResult, SystemDesignAttemptResult } from '../types/practiceHistory';
import { languageLabel } from '../utils/codeReview';
import { HISTORY_PATH, MODE_LABELS, MODE_PATHS, startPath } from '../utils/practiceLinks';
import { optionLetter } from '../utils/quizRound';
import { CodeSnippet } from './CodeSnippet';
import { ReviewResult } from './CodeReviewMode';
import { AnswerVerdict } from './QuizMode';
import { ScenarioCard, ScoreReport } from './SystemDesignMode';

/**
 * One practice attempt from the history, at /dashboard/history/:id: that
 * mode's own result screen drawn again from what the server stored
 * (GET /api/practice/attempts/{id}), without the buttons that only make
 * sense straight after scoring. Someone else's attempt is a 404 on the
 * server, and reads here as not in the history.
 */

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';
const actionLink =
  'inline-block px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-brand-400';

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'failed'; message: string } | { state: 'ready'; attempt: PracticeAttemptDetail };

export function PracticeAttemptPage() {
  const { id } = useParams();
  const attemptId = Number(id);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      setLoaded({ state: 'missing' });
      return;
    }
    const controller = new AbortController();
    setLoaded({ state: 'loading' });
    fetchPracticeAttempt(attemptId, controller.signal)
      .then(attempt => setLoaded({ state: 'ready', attempt }))
      .catch(cause => {
        if (isAbortError(cause)) return;
        if (cause instanceof ApiError && cause.isNotFound) setLoaded({ state: 'missing' });
        else setLoaded({ state: 'failed', message: errorMessage(cause, 'Could not load this attempt.') });
      });
    return () => controller.abort();
  }, [attemptId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Link to={HISTORY_PATH} className="text-sm font-bold text-brand-600 dark:text-brand-400 hover:underline">
          ← Practice history
        </Link>
        {loaded.state === 'ready' && (
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {MODE_LABELS[loaded.attempt.kind]} · {new Date(loaded.attempt.createdAt).toLocaleString()}
          </p>
        )}
      </div>

      {loaded.state === 'loading' ? (
        <p className="text-sm text-slate-400 italic animate-pulse">Loading this attempt…</p>
      ) : loaded.state === 'missing' ? (
        <p className={`${card} p-6 text-sm text-slate-500 dark:text-slate-400`}>That attempt is not in your practice history.</p>
      ) : loaded.state === 'failed' ? (
        <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
          {loaded.message}
        </p>
      ) : (
        <AttemptResult attempt={loaded.attempt} />
      )}
    </div>
  );
}

function AttemptResult({ attempt }: { attempt: PracticeAttemptDetail }) {
  switch (attempt.kind) {
    case 'quiz':
      return <QuizAnswer result={attempt.result} />;
    case 'code_review':
      return (
        <div className="space-y-6">
          <ReviewResult result={attempt.result} />
          <Link to={MODE_PATHS.code_review} className={actionLink}>
            Review another snippet
          </Link>
        </div>
      );
    case 'system_design':
      return <DesignAnswer result={attempt.result} />;
  }
}

function QuizAnswer({ result }: { result: QuizAttemptResult }) {
  const { question } = result;

  return (
    <div className={`${card} max-w-3xl p-5 sm:p-8`}>
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
        {languageLabel(question.language)} · {question.topicLabel} · <span className="capitalize">{question.difficulty}</span>
      </p>
      {!question.published && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          This question has since been taken out of the question bank, so it will not come up in a round again.
        </p>
      )}

      <div className="mt-6 space-y-4">
        <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{question.prompt}</p>
        {question.code && <CodeSnippet code={question.code} />}
      </div>

      <ul aria-label="Options" className="mt-6 grid gap-3">
        {question.options.map((option, i) => {
          const isAnswer = option === result.answer;
          const isChoice = option === result.choice;
          const style = isAnswer
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
            : isChoice
              ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10'
              : 'border-slate-200 dark:border-slate-700 opacity-60';
          return (
            <li key={option} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${style}`}>
              <span className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
                {optionLetter(i)}
              </span>
              <span className="flex-1 font-mono text-sm text-slate-900 dark:text-slate-100 break-words">{option}</span>
              {isAnswer && <span className="text-xs font-bold text-emerald-600">✓ {isChoice ? 'Your answer' : 'Answer'}</span>}
              {isChoice && !isAnswer && <span className="text-xs font-bold text-rose-500">✗ Your answer</span>}
            </li>
          );
        })}
      </ul>

      <AnswerVerdict
        verdict={{ correct: result.correct, answer: result.answer, explanation: result.explanation }}
        choice={result.choice}
        questionId={question.id}
        reportable={question.published}
      />

      <div className="mt-6">
        <Link to={startPath({ mode: 'quiz', language: question.language, topic: question.topic })} className={actionLink}>
          Practise this topic
        </Link>
      </div>
    </div>
  );
}

function DesignAnswer({ result }: { result: SystemDesignAttemptResult }) {
  return (
    <div className="space-y-6">
      <ScenarioCard scenario={result.scenario} />
      <ScoreReport report={result.report} rubric={result.rubric} />

      <section aria-labelledby="sd-your-answer" className={`${card} p-6`}>
        <h4 id="sd-your-answer" className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
          Your answer
        </h4>
        <dl className="space-y-4">
          {result.rubric.sections.map(section => {
            const text = result.sections[section.key]?.trim() ?? '';
            return (
              <div key={section.key}>
                <dt className="text-sm font-bold text-slate-800 dark:text-slate-100">{section.label}</dt>
                <dd className={`mt-1 text-sm whitespace-pre-wrap ${text ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 italic'}`}>
                  {text || 'Nothing written.'}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <Link to={MODE_PATHS.system_design} className={actionLink}>
        Try another scenario
      </Link>
    </div>
  );
}
