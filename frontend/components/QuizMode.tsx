import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { answerQuizQuestion, fetchQuizCatalog, fetchQuizProgress, startQuizRound } from '../services/practiceClient';
import { ApiError, errorMessage, isAbortError } from '../services/http';
import { PracticeLanguage, QuizCatalog, QuizLanguage, QuizProgress, QuizQuestion, QuizRoundTopic } from '../types/practice';
import {
  isOpen,
  MISTAKES,
  missedQuestions,
  MIXED,
  optionIndexForKey,
  optionLetter,
  QuizRound,
  QuizRoundAction,
  quizRoundReducer,
  retryQuestions,
  ROUND_SIZE,
  roundLabel,
  roundScore,
  SECONDS_PER_QUESTION,
} from '../utils/quizRound';
import { CodeSnippet } from './CodeSnippet';
import { ReportQuestion } from './ReportQuestion';

/**
 * Mission Control's Quiz mode: multiple-choice questions about a language,
 * in rounds of ten from the reviewed bank. Every answer is scored on the
 * server and stored on the account; no model is called and nothing counts
 * against the plan, so there is no PremiumGate here.
 *
 * Round state is the pure reducer in utils/quizRound.ts. Mistakes and
 * accuracy come from the server (GET /practice/quiz/progress), not from this
 * browser.
 */
export function QuizMode() {
  const [catalog, setCatalog] = useState<QuizCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [language, setLanguage] = useState<PracticeLanguage | null>(null);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [timed, setTimed] = useState(false);
  const [round, dispatch] = useReducer(quizRoundReducer, null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchQuizCatalog(controller.signal)
      .then(loaded => {
        setCatalog(loaded);
        const first = loaded.languages.find(l => l.questionCount > 0) ?? loaded.languages[0];
        setLanguage(current => current ?? first?.key ?? null);
      })
      .catch(cause => {
        if (!isAbortError(cause)) setLoadError(errorMessage(cause, 'Could not load the quiz.'));
      });
    return () => controller.abort();
  }, []);

  // Read again each time the menu comes back, so a finished round shows.
  const inRound = round !== null;
  useEffect(() => {
    if (!language || inRound) return;
    const controller = new AbortController();
    fetchQuizProgress(language, controller.signal)
      .then(setProgress)
      .catch(() => {
        // Progress is a nicety on the menu; the rounds work without it.
      });
    return () => controller.abort();
  }, [language, inRound]);

  const selected = catalog?.languages.find(l => l.key === language) ?? null;

  const start = async (topic: QuizRoundTopic) => {
    if (!language || starting) return;
    setNotice(null);
    setStarting(true);
    try {
      const { questions } = await startQuizRound(language, topic);
      if (questions.length === 0) {
        setNotice(
          topic === MISTAKES
            ? 'No open mistakes to retry right now. Questions you get wrong come back here.'
            : 'There are no questions to play here yet.',
        );
        return;
      }
      dispatch({ type: 'start', language, topic, questions, timed });
    } catch (cause) {
      setNotice(errorMessage(cause, 'Could not start a round.'));
    } finally {
      setStarting(false);
    }
  };

  const retry = (finished: QuizRound) =>
    dispatch({ type: 'start', language: finished.language, topic: MISTAKES, questions: retryQuestions(finished), timed });

  if (loadError) {
    return (
      <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
        {loadError}
      </p>
    );
  }

  if (!catalog || !selected) {
    return <p className="text-sm text-slate-400 italic animate-pulse">Loading the quiz…</p>;
  }

  if (round) {
    return round.finished ? (
      <RoundSummary
        round={round}
        language={selected}
        onRetry={() => retry(round)}
        onReplay={() => {
          dispatch({ type: 'quit' });
          void start(round.topic);
        }}
        onExit={() => dispatch({ type: 'quit' })}
      />
    ) : (
      <RoundPlay round={round} language={selected} dispatch={dispatch} />
    );
  }

  return (
    <QuizMenu
      catalog={catalog}
      language={selected}
      progress={progress?.language === selected.key ? progress : null}
      timed={timed}
      starting={starting}
      notice={notice}
      onLanguage={key => {
        setNotice(null);
        setProgress(null);
        setLanguage(key);
      }}
      onTimed={setTimed}
      onStart={topic => void start(topic)}
    />
  );
}

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';

function QuizMenu({
  catalog,
  language,
  progress,
  timed,
  starting,
  notice,
  onLanguage,
  onTimed,
  onStart,
}: {
  catalog: QuizCatalog;
  language: QuizLanguage;
  progress: QuizProgress | null;
  timed: boolean;
  starting: boolean;
  notice: string | null;
  onLanguage: (key: PracticeLanguage) => void;
  onTimed: (timed: boolean) => void;
  onStart: (topic: QuizRoundTopic) => void;
}) {
  const mistakes = progress?.openMistakes ?? 0;

  return (
    <div className="space-y-6">
      <section className={`${card} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold flex items-center">
              <span className="mr-2">❓</span> Language quiz
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Rounds of {ROUND_SIZE} multiple-choice questions on a language, from a reviewed bank. Every answer comes
              with an explanation, and the ones you miss come back in later rounds. Free, with no AI involved.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={timed}
              onChange={e => onTimed(e.target.checked)}
              className="rounded border-slate-300 text-brand-600"
            />
            ⏱ Timed ({SECONDS_PER_QUESTION}s a question)
          </label>
        </div>

        <div role="group" aria-label="Language" className="mt-5 flex flex-wrap gap-2">
          {catalog.languages.map(l => {
            const active = l.key === language.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={active}
                disabled={l.questionCount === 0}
                onClick={() => onLanguage(l.key)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400'
                }`}
              >
                {l.label}
                <span className={`ml-2 text-[10px] font-bold ${active ? 'text-white/80' : 'text-slate-400'}`}>
                  {l.questionCount}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={starting}
            onClick={() => onStart(MIXED)}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold disabled:opacity-50"
          >
            Mixed round
          </button>
          <button
            type="button"
            disabled={starting || mistakes === 0}
            onClick={() => onStart(MISTAKES)}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-brand-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mistakes{mistakes > 0 ? ` (${mistakes})` : ''}
          </button>
          {progress && progress.answered > 0 && (
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {progress.answered} answered · {progress.accuracy}% right
            </span>
          )}
        </div>

        {notice && (
          <p role="status" className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-400">
            {notice}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">Or drill one topic</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {language.topics.map(topic => {
            const stats = progress?.topics.find(t => t.key === topic.key);
            return (
              <button
                key={topic.key}
                type="button"
                disabled={starting || topic.questionCount === 0}
                onClick={() => onStart(topic.key)}
                className={`${card} text-left p-5 hover:border-brand-300 dark:hover:border-brand-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{topic.label}</span>
                  {stats && stats.accuracy !== null ? (
                    <span className="shrink-0 text-xs font-bold text-brand-600 dark:text-brand-400">{stats.accuracy}%</span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">New</span>
                  )}
                </span>
                <span className="block mt-2 text-xs text-slate-400">
                  {topic.questionCount} questions
                  {stats && stats.answered > 0 ? ` · ${stats.answered} answered` : ''}
                  {stats && stats.openMistakes > 0 ? ` · ${stats.openMistakes} to retry` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RoundPlay({
  round,
  language,
  dispatch,
}: {
  round: QuizRound;
  language: QuizLanguage;
  dispatch: React.Dispatch<QuizRoundAction>;
}) {
  const question = round.questions[round.index];
  const open = isOpen(round);
  const verdict = round.verdict;
  const isLast = round.index + 1 === round.questions.length;
  const nextRef = useRef<HTMLButtonElement>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);

  const answer = useCallback(
    async (choice: string | null) => {
      if (!open) return;
      dispatch({ type: 'choose', choice });
      try {
        const result = await answerQuizQuestion(question.id, choice);
        dispatch({ type: 'verdict', questionId: question.id, verdict: result });
      } catch (cause) {
        if (cause instanceof ApiError && cause.isNotFound) {
          // Unpublished since the round began: skip it rather than stall.
          dispatch({ type: 'drop', questionId: question.id });
        } else {
          dispatch({
            type: 'failed',
            questionId: question.id,
            message: errorMessage(cause, 'Could not check that answer. Try again.'),
          });
        }
      }
    },
    [open, question.id, dispatch],
  );

  const next = useCallback(() => dispatch({ type: 'next' }), [dispatch]);

  // The optional countdown. Running out answers with null, which is wrong.
  useEffect(() => {
    if (!round.timed || !open) return;
    const deadline = Date.now() + SECONDS_PER_QUESTION * 1000;
    setTimeLeft(SECONDS_PER_QUESTION);
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        window.clearInterval(id);
        void answer(null);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [round.timed, round.index, open, answer]);

  // Once the verdict is in, Enter or Space on the focused button moves on.
  useEffect(() => {
    if (verdict) nextRef.current?.focus();
  }, [verdict]);

  // Keys 1-4 or A-D answer; Enter moves on once answered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      if (verdict) {
        if (e.key === 'Enter' && !target?.closest?.('button')) {
          e.preventDefault();
          next();
        }
        return;
      }

      const index = optionIndexForKey(e.key, question.options.length);
      if (index !== null && open) {
        e.preventDefault();
        void answer(question.options[index]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict, open, question.options, answer, next]);

  const score = roundScore(round);

  return (
    <div className={`${card} max-w-3xl mx-auto p-5 sm:p-8`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          {language.label} · {roundLabel(round.topic, language.topics)} · {round.index + 1} of {round.questions.length}
        </p>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-brand-600 dark:text-brand-400" title="Right so far">
            ✓ {score}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'quit' })}
            aria-label="End round"
            title="End round"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${((round.index + (verdict ? 1 : 0)) / round.questions.length) * 100}%` }}
        />
      </div>
      {round.timed && (
        <div className="flex items-center gap-2 mb-2" aria-hidden={!open}>
          <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${timeLeft <= 5 ? 'bg-rose-500' : 'bg-amber-400'}`}
              style={{ width: `${open ? (timeLeft / SECONDS_PER_QUESTION) * 100 : 0}%` }}
            />
          </div>
          <span className={`text-xs font-bold tabular-nums w-8 text-right ${timeLeft <= 5 ? 'text-rose-600' : 'text-slate-500'}`}>
            {open ? `${timeLeft}s` : ''}
          </span>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{question.prompt}</p>
        {question.code && <CodeSnippet code={question.code} />}
      </div>

      <div className="mt-6 grid gap-3">
        {question.options.map((option, i) => {
          const isAnswer = verdict !== null && option === verdict.answer;
          const isChoice = option === round.choice;
          let style = 'border-slate-200 dark:border-slate-700 hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-500/5';
          if (verdict) {
            if (isAnswer) style = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10';
            else if (isChoice) style = 'border-rose-400 bg-rose-50 dark:bg-rose-500/10';
            else style = 'border-slate-200 dark:border-slate-700 opacity-60';
          } else if (round.checking && isChoice) {
            style = 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10';
          }
          return (
            <button
              key={option}
              type="button"
              disabled={!open}
              onClick={() => void answer(option)}
              className={`flex items-center gap-3 text-left px-4 py-3 rounded-xl border-2 transition-colors disabled:cursor-default ${style}`}
            >
              <span className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
                {optionLetter(i)}
              </span>
              <span className="flex-1 font-mono text-sm text-slate-900 dark:text-slate-100 break-words">{option}</span>
              {isAnswer && <span className="text-emerald-600 font-bold">✓</span>}
              {verdict && isChoice && !isAnswer && <span className="text-rose-500 font-bold">✗</span>}
            </button>
          );
        })}
      </div>

      {round.error && (
        <p role="alert" className="mt-4 text-sm font-bold text-rose-600 dark:text-rose-400">
          {round.error}
        </p>
      )}

      <div aria-live="polite">
        {verdict && (
          <div
            className={`mt-6 rounded-2xl p-4 sm:p-5 border ${
              verdict.correct
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                : 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30'
            }`}
          >
            <p className={`font-bold mb-1 ${verdict.correct ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-900 dark:text-amber-300'}`}>
              {verdict.correct
                ? 'Correct!'
                : round.choice === null
                  ? `Time's up. The answer is “${verdict.answer}”.`
                  : `Not quite. The answer is “${verdict.answer}”.`}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{verdict.explanation}</p>
            <ReportQuestion key={question.id} questionId={question.id} />
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 min-h-11">
        <p className="hidden sm:block text-xs text-slate-400">
          {verdict ? 'Press Enter to continue' : round.checking ? 'Checking…' : 'Keys A–D or 1–4 to answer'}
        </p>
        {verdict && (
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="ml-auto px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold"
          >
            {isLast ? 'See results' : 'Next question'} →
          </button>
        )}
      </div>
    </div>
  );
}

function verdictLine(score: number, total: number): string {
  if (score === total) return 'A perfect round.';
  if (score >= total * 0.8) return 'Great work.';
  if (score >= total * 0.5) return 'Good effort. Go over the ones you missed below.';
  return 'Keep going. Each explanation below is worth learning.';
}

function RoundSummary({
  round,
  language,
  onRetry,
  onReplay,
  onExit,
}: {
  round: QuizRound;
  language: QuizLanguage;
  onRetry: () => void;
  onReplay: () => void;
  onExit: () => void;
}) {
  const score = roundScore(round);
  const total = round.answers.length;
  const missed = round.answers.filter(a => !a.correct);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className={`${card} p-6 sm:p-8 text-center`}>
        <p className="text-sm font-bold text-slate-500">
          {language.label} · {roundLabel(round.topic, language.topics)}
        </p>
        <p className="mt-2 text-5xl font-bold text-slate-900 dark:text-slate-50">{`${score} / ${total}`}</p>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{verdictLine(score, total)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {missedQuestions(round).length > 0 && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold"
            >
              Retry mistakes ({missed.length})
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-brand-400"
          >
            Play another round
          </button>
          <button type="button" onClick={onExit} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Back to topics
          </button>
        </div>
      </section>

      {missed.length > 0 && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">What to remember</h3>
          <ul className="space-y-3">
            {missed.map(({ question, choice, answer, explanation }) => (
              <MissedQuestion key={question.id} question={question} choice={choice} answer={answer} explanation={explanation} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MissedQuestion({
  question,
  choice,
  answer,
  explanation,
}: {
  question: QuizQuestion;
  choice: string | null;
  answer: string;
  explanation: string;
}) {
  return (
    <li className={`${card} p-5 space-y-3`}>
      <p className="font-bold text-slate-800 dark:text-slate-100">{question.prompt}</p>
      {question.code && <CodeSnippet code={question.code} />}
      <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
        Answer: <span className="font-mono">{answer}</span>
      </p>
      <p className="text-sm text-rose-600 dark:text-rose-400">
        {choice === null ? 'No answer: time ran out.' : <>You chose: <span className="font-mono">{choice}</span></>}
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{explanation}</p>
    </li>
  );
}
