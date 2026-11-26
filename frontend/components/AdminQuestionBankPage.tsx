import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchQuizCatalog } from '../services/practiceClient';
import { fetchQuestionBank, generateDrafts } from '../services/questionBankClient';
import { aiFailureMessage, errorMessage, isAbortError } from '../services/http';
import { PracticeDifficulty, PracticeKind, PracticeLanguage, QuizCatalog } from '../types/practice';
import { GenerateDraftsInput, GenerateDraftsResult, QuestionBankPage, QuestionFilters } from '../types/questionBank';
import { DIFFICULTIES, KIND_LABELS, QuestionBankCard } from './QuestionBankCard';
import { useToast } from './ToastProvider';

const select =
  'w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100';
const labelText = 'text-[10px] font-bold uppercase tracking-widest text-slate-400';
const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5';

const MAX_DRAFTS = 5;

/** What each kind's drafts are checked for before they are saved: the server's checks, in words. */
const DRAFT_CHECKS: Record<PracticeKind, string> = {
  quiz: 'four different options, the answer one of them, an explanation, a snippet of at most 40 lines, and the language and topic asked for',
  code_review:
    "20 to 80 lines of code, 2 to 6 planted issues each with a category, a severity of 1 to 3 and a fix, every issue's lines inside the snippet (at most 15, starting and ending on code) and on the lines the AI quoted for it, and the language asked for",
  system_design:
    'a title, a scenario with scale numbers in it, an explanation, and 2 to 6 distinct key points for every rubric trait',
};

/**
 * Admin · Question bank: every practice question of every kind, and the
 * review flow for AI drafts. The AI drafts, the server checks every draft in
 * code, and nothing reaches a user until it is published here. Seed
 * questions are read-only: they are fixed in backend/resources/practice.
 */
export function AdminQuestionBankPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<QuizCatalog | null>(null);
  const [filters, setFilters] = useState<QuestionFilters>({});
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0);
  const [bank, setBank] = useState<QuestionBankPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetchQuizCatalog(controller.signal)
      .then(setCatalog)
      .catch(e => {
        if (!isAbortError(e)) toast(errorMessage(e, 'Could not load the languages.'), 'error');
      });
    return () => controller.abort();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    setLoading(true);
    fetchQuestionBank(filters, page, controller.signal)
      .then(setBank)
      .catch(e => {
        if (!isAbortError(e)) toast(errorMessage(e, 'Could not load the question bank.'), 'error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isAdmin, filters, page, reloads]);

  if (!isAdmin) return <Navigate to="/account" replace />;

  const setFilter = <K extends keyof QuestionFilters>(key: K, value: QuestionFilters[K]) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '' || value === false || value === undefined) delete next[key];
      else next[key] = value;
      // A topic belongs to a language.
      if (key === 'language') delete next.topic;
      return next;
    });
    setPage(1);
  };

  const filterTopics = catalog?.languages.find(l => l.key === filters.language)?.topics ?? [];
  const questions = bank?.questions ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Question bank</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          The questions practice modes serve. The AI drafts questions and the server checks each one in code; nothing reaches
          a user until you publish it. Read every key against the AI's notes before you do. Seed questions are fixed in their
          files, not here.
        </p>
      </div>

      <GeneratePanel
        catalog={catalog}
        generators={bank?.generators ?? ['quiz']}
        onGenerated={() => {
          setPage(1);
          setReloads(n => n + 1);
        }}
      />

      <section aria-label="Filters" className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <span className={labelText}>Kind</span>
          <select
            aria-label="Filter by kind"
            className={select}
            value={filters.kind ?? ''}
            onChange={e => setFilter('kind', e.target.value as PracticeKind | '')}
          >
            <option value="">All kinds</option>
            {(Object.keys(KIND_LABELS) as PracticeKind[]).map(kind => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <span className={labelText}>Status</span>
          <select
            aria-label="Filter by status"
            className={select}
            value={filters.status ?? ''}
            onChange={e => setFilter('status', e.target.value as QuestionFilters['status'])}
          >
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div className="w-36">
          <span className={labelText}>Language</span>
          <select
            aria-label="Filter by language"
            className={select}
            value={filters.language ?? ''}
            onChange={e => setFilter('language', e.target.value as PracticeLanguage | '')}
          >
            <option value="">Any language</option>
            {(catalog?.languages ?? []).map(l => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-48">
          <span className={labelText}>Topic</span>
          <select
            aria-label="Filter by topic"
            className={select}
            value={filters.topic ?? ''}
            disabled={filterTopics.length === 0}
            onChange={e => setFilter('topic', e.target.value)}
          >
            <option value="">Any topic</option>
            {filterTopics.map(t => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <span className={labelText}>Source</span>
          <select
            aria-label="Filter by source"
            className={select}
            value={filters.source ?? ''}
            onChange={e => setFilter('source', e.target.value as QuestionFilters['source'])}
          >
            <option value="">Any source</option>
            <option value="ai">AI draft</option>
            <option value="admin">Admin</option>
            <option value="seed">Seed</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={filters.reported ?? false} onChange={e => setFilter('reported', e.target.checked)} />
          Only reported
        </label>
        <p className="ml-auto pb-2 text-xs text-slate-400">
          {bank ? `${bank.meta.total} ${bank.meta.total === 1 ? 'question' : 'questions'}` : ''}
        </p>
      </section>

      {loading && !bank ? (
        <p className="text-sm text-slate-500">Loading questions…</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-slate-500">No questions match these filters.</p>
      ) : (
        <div className="space-y-4">
          {questions.map(question => (
            <QuestionBankCard
              key={question.id}
              question={question}
              catalog={catalog}
              onChange={updated =>
                setBank(prev => prev && { ...prev, questions: prev.questions.map(q => (q.id === updated.id ? updated : q)) })
              }
              onRemove={id =>
                setBank(
                  prev =>
                    prev && {
                      ...prev,
                      questions: prev.questions.filter(q => q.id !== id),
                      meta: { ...prev.meta, total: prev.meta.total - 1 },
                    },
                )
              }
            />
          ))}
        </div>
      )}

      {bank && bank.meta.lastPage > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
          >
            ← Newer
          </button>
          <span className="text-slate-500">
            Page {bank.meta.page} of {bank.meta.lastPage}
          </span>
          <button
            type="button"
            disabled={page >= bank.meta.lastPage}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
          >
            Older →
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * Ask the AI for up to five drafts. They are saved as drafts for review, and
 * what the checks refused is listed with its reasons. Each kind asks for its
 * own fields: language, topic and difficulty for the quiz, language and
 * difficulty for code review, difficulty for system design.
 */
function GeneratePanel({
  catalog,
  generators,
  onGenerated,
}: {
  catalog: QuizCatalog | null;
  generators: PracticeKind[];
  onGenerated: () => void;
}) {
  const [kind, setKind] = useState<PracticeKind>(generators[0] ?? 'quiz');
  const [language, setLanguage] = useState<PracticeLanguage | ''>('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('medium');
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateDraftsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Until the admin picks, the first language and its first topic.
  const languageKey = language || catalog?.languages[0]?.key || '';
  const topics = catalog?.languages.find(l => l.key === languageKey)?.topics ?? [];
  const topicKey = topics.some(t => t.key === topic) ? topic : (topics[0]?.key ?? '');
  const needsLanguage = kind === 'quiz' || kind === 'code_review';
  const needsTopic = kind === 'quiz';
  const ready = (!needsLanguage || languageKey !== '') && (!needsTopic || topicKey !== '');

  const input = (): GenerateDraftsInput => {
    if (kind === 'quiz') return { kind, language: languageKey as PracticeLanguage, topic: topicKey, difficulty, count };
    if (kind === 'code_review') return { kind, language: languageKey as PracticeLanguage, difficulty, count };
    return { kind, difficulty, count };
  };

  const generate = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await generateDrafts(input()));
      onGenerated();
    } catch (e) {
      setError(aiFailureMessage(e, 'Could not draft questions.'));
    } finally {
      setBusy(false);
    }
  };

  const saved = result?.drafts.length ?? 0;

  return (
    <section aria-label="Generate with AI" className={card}>
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Draft questions with AI</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Each draft is checked before it is saved: {DRAFT_CHECKS[kind]}. Drafts stay hidden from users until you publish
        them.
      </p>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <label className="block min-w-0">
          <span className={labelText}>Kind</span>
          <select aria-label="Kind" className={select} value={kind} onChange={e => setKind(e.target.value as PracticeKind)}>
            {generators.map(k => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {needsLanguage && (
          <label className="block min-w-0">
            <span className={labelText}>Language</span>
            <select
              aria-label="Language"
              className={select}
              value={languageKey}
              onChange={e => {
                setLanguage(e.target.value as PracticeLanguage);
                setTopic('');
              }}
            >
              {(catalog?.languages ?? []).map(l => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsTopic && (
          <label className="block min-w-0">
            <span className={labelText}>Topic</span>
            <select aria-label="Topic" className={select} value={topicKey} onChange={e => setTopic(e.target.value)}>
              {topics.map(t => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block min-w-0">
          <span className={labelText}>Difficulty</span>
          <select
            aria-label="Difficulty"
            className={select}
            value={difficulty}
            onChange={e => setDifficulty(e.target.value as PracticeDifficulty)}
          >
            {DIFFICULTIES.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelText}>How many</span>
          <input
            aria-label="How many"
            type="number"
            min={1}
            max={MAX_DRAFTS}
            className={select}
            value={count}
            onChange={e => setCount(Math.min(MAX_DRAFTS, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void generate()}
        className="mt-4 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold disabled:opacity-40"
      >
        {busy ? 'Drafting…' : 'Draft questions'}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-4 space-y-2 text-sm" aria-live="polite">
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {saved === 0 && result.rejected.length === 0
              ? 'The AI returned nothing usable. Try again.'
              : `${saved} ${saved === 1 ? 'draft' : 'drafts'} saved for review${saved ? ' below' : ''}.${
                  result.rejected.length ? ` ${result.rejected.length} refused by the checks:` : ''
                }`}
          </p>
          {result.rejected.length > 0 && (
            <ul className="space-y-2">
              {result.rejected.map(item => (
                <li key={item.index} className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    #{item.index} · {item.prompt ?? 'No prompt'}
                  </p>
                  <ul className="list-disc pl-5 text-amber-900/80 dark:text-amber-200/80">
                    {item.reasons.map(reason => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
