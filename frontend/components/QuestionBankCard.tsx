import React, { useState } from 'react';
import { deleteQuestion, resolveReports, updateQuestion } from '../services/questionBankClient';
import { ApiError, errorMessage } from '../services/http';
import { PracticeDifficulty, PracticeKind, PracticeLanguage, QuizCatalog } from '../types/practice';
import { AdminQuestion, QuestionPatch } from '../types/questionBank';
import { OPTION_COUNT, quizAnswer, quizNotes, QuizForm, toQuizForm, toQuizPatch } from '../utils/questionDraft';
import { optionLetter } from '../utils/quizRound';
import { CodeSnippet } from './CodeSnippet';
import { useToast } from './ToastProvider';

export const KIND_LABELS: Record<PracticeKind, string> = {
  quiz: 'Quiz',
  code_review: 'Code review',
  system_design: 'System design',
};

export const DIFFICULTIES: PracticeDifficulty[] = ['easy', 'medium', 'hard'];

const SOURCE_LABELS: Record<AdminQuestion['source'], string> = { seed: 'Seed', ai: 'AI draft', admin: 'Admin' };

const field =
  'w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100';
const labelText = 'text-[10px] font-bold uppercase tracking-widest text-slate-400';
const button = 'px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40';

/** "JavaScript", "Scope & closures": the catalog's words for a stored key. */
export function catalogLabels(catalog: QuizCatalog | null) {
  const language = (key: PracticeLanguage | null) => catalog?.languages.find(l => l.key === key)?.label ?? key ?? '';
  const topic = (languageKey: PracticeLanguage | null, key: string) =>
    catalog?.languages.find(l => l.key === languageKey)?.topics.find(t => t.key === key)?.label ?? key;
  return { language, topic };
}

/**
 * One question on the admin's question bank: as a user would see it, then
 * the key, the explanation and the AI's review notes, then its open reports.
 * Edit, Publish, Unpublish and Delete for everything but seed rows, which
 * are fixed in their file (the server refuses them too).
 */
export function QuestionBankCard({
  question,
  catalog,
  onChange,
  onRemove,
}: {
  question: AdminQuestion;
  catalog: QuizCatalog | null;
  onChange: (question: AdminQuestion) => void;
  onRemove: (id: number) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const labels = catalogLabels(catalog);
  const isSeed = question.source === 'seed';
  const isQuiz = question.kind === 'quiz';

  const act = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast(errorMessage(e, failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: AdminQuestion['status']) =>
    act(async () => {
      onChange(await updateQuestion(question.id, { status }));
      toast(status === 'published' ? 'Published. Users can be served it now.' : 'Unpublished.', 'success');
    }, 'Could not change the status.');

  const remove = () => {
    if (!window.confirm('Delete this question? If anyone has answered it, it is unpublished instead.')) return;
    void act(async () => {
      const result = await deleteQuestion(question.id);
      if (result.deleted || !result.question) {
        onRemove(question.id);
        toast('Question deleted.', 'success');
      } else {
        onChange(result.question);
        toast(`It has ${result.question.attemptCount} attempts, so it was kept and we unpublished it instead.`, 'info');
      }
    }, 'Could not delete the question.');
  };

  const resolve = () =>
    act(async () => {
      onChange(await resolveReports(question.id));
      toast('Reports resolved.', 'success');
    }, 'Could not resolve the reports.');

  const meta = [KIND_LABELS[question.kind], labels.language(question.language), labels.topic(question.language, question.topic), question.difficulty]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      aria-label={`Question ${question.id}`}
      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4"
    >
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded font-bold uppercase tracking-widest text-[10px] ${
            question.status === 'published'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
          }`}
        >
          {question.status === 'published' ? 'Published' : 'Draft'}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
          {SOURCE_LABELS[question.source]}
        </span>
        <span className="text-slate-500 dark:text-slate-400">{meta}</span>
        <span className="ml-auto text-slate-400">
          #{question.id} · {question.attemptCount} {question.attemptCount === 1 ? 'attempt' : 'attempts'}
        </span>
      </header>

      {editing && isQuiz ? (
        <QuizEditor
          question={question}
          catalog={catalog}
          onCancel={() => setEditing(false)}
          onSaved={saved => {
            onChange(saved);
            setEditing(false);
            toast('Saved.', 'success');
          }}
        />
      ) : (
        <Review question={question} />
      )}

      {question.openReports > 0 && (
        <section className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-rose-800 dark:text-rose-300">
              {question.openReports} open {question.openReports === 1 ? 'report' : 'reports'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resolve()}
              className={`${button} bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300`}
            >
              Resolve reports
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
            {question.reports.map(report => (
              <li key={report.id}>{report.reason}</li>
            ))}
          </ul>
        </section>
      )}

      {isSeed ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Seed question <code className="font-mono">{question.externalId}</code>: read-only here. Fix it in its file under
          backend/resources/practice, or the next deploy puts the file's version back.
        </p>
      ) : (
        !editing && (
          <div className="flex flex-wrap gap-2">
            {isQuiz && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className={`${button} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
              >
                Edit
              </button>
            )}
            {question.status === 'draft' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus('published')}
                className={`${button} bg-brand-600 hover:bg-brand-500 text-white`}
              >
                Publish
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus('draft')}
                className={`${button} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
              >
                Unpublish
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={`${button} ml-auto text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}
            >
              Delete
            </button>
          </div>
        )
      )}
    </article>
  );
}

/** The question as a user would see it, then what only an admin sees. */
function Review({ question }: { question: AdminQuestion }) {
  const answer = quizAnswer(question);
  const notes = quizNotes(question);
  const options = question.options ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="font-bold text-slate-900 dark:text-slate-50 whitespace-pre-wrap">{question.prompt}</p>
        {/* Contained, so a long line scrolls inside the snippet instead of widening the page on a phone. */}
        {question.code && (
          <div className="[contain:inline-size]">
            <CodeSnippet code={question.code} />
          </div>
        )}
        {options.length > 0 && (
          <ol className="grid gap-2">
            {options.map((option, i) => (
              <li
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
              >
                <span className="shrink-0 w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center justify-center">
                  {optionLetter(i)}
                </span>
                <span className="min-w-0 font-mono break-words">{option}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2 text-sm">
        {question.kind === 'quiz' ? (
          <p className={`font-bold ${answer !== null && options.includes(answer) ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}>
            {answer !== null && options.includes(answer) ? `Answer: ${answer}` : 'Answer: none of the options'}
          </p>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {JSON.stringify(question.answer, null, 2)}
          </pre>
        )}
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{question.explanation}</p>
        {notes.length > 0 && (
          <div>
            <p className={labelText}>Why the others are wrong (the AI's notes)</p>
            <ul className="mt-1 space-y-1">
              {notes.map(note => (
                <li key={note.option} className={note.onAnswer ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}>
                  <span className="font-mono font-semibold">{note.option}</span>: <span>{note.why}</span>
                  {note.onAnswer && (
                    <span className="block text-xs font-bold">The AI explained why the answer is wrong. Check the key.</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** The quiz editor. The server checks the whole question on Save. */
function QuizEditor({
  question,
  catalog,
  onCancel,
  onSaved,
}: {
  question: AdminQuestion;
  catalog: QuizCatalog | null;
  onCancel: () => void;
  onSaved: (question: AdminQuestion) => void;
}) {
  const [form, setForm] = useState<QuizForm>(() => toQuizForm(question));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const topics = catalog?.languages.find(l => l.key === form.language)?.topics ?? [];
  const set = (patch: Partial<QuizForm>) => setForm(prev => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const patch: QuestionPatch = toQuizPatch(form);
      onSaved(await updateQuestion(question.id, patch));
    } catch (e) {
      const fieldErrors = e instanceof ApiError && e.errors ? Object.values(e.errors).flat() : [];
      setErrors(fieldErrors.length ? fieldErrors : [errorMessage(e, 'Could not save the question.')]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block min-w-0">
          <span className={labelText}>Language</span>
          <select
            aria-label="Language"
            className={field}
            value={form.language}
            onChange={e => {
              const language = e.target.value as PracticeLanguage;
              set({ language, topic: catalog?.languages.find(l => l.key === language)?.topics[0]?.key ?? '' });
            }}
          >
            {(catalog?.languages ?? []).map(l => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelText}>Topic</span>
          <select aria-label="Topic" className={field} value={form.topic} onChange={e => set({ topic: e.target.value })}>
            {topics.map(t => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
            {!topics.some(t => t.key === form.topic) && <option value={form.topic}>{form.topic}</option>}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelText}>Difficulty</span>
          <select
            aria-label="Difficulty"
            className={field}
            value={form.difficulty}
            onChange={e => set({ difficulty: e.target.value as PracticeDifficulty })}
          >
            {DIFFICULTIES.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block min-w-0">
        <span className={labelText}>Prompt</span>
        <textarea aria-label="Prompt" className={field} rows={2} value={form.prompt} onChange={e => set({ prompt: e.target.value })} />
      </label>
      <label className="block min-w-0">
        <span className={labelText}>Code (optional, at most 40 lines)</span>
        <textarea
          aria-label="Code"
          className={`${field} font-mono text-[13px]`}
          rows={Math.min(14, Math.max(3, form.code.split('\n').length + 1))}
          spellCheck={false}
          value={form.code}
          onChange={e => set({ code: e.target.value })}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className={labelText}>Options: pick the answer</legend>
        {Array.from({ length: OPTION_COUNT }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`answer-${question.id}`}
              aria-label={`Option ${optionLetter(i)} is the answer`}
              checked={form.answerIndex === i}
              onChange={() => set({ answerIndex: i })}
            />
            <input
              aria-label={`Option ${optionLetter(i)}`}
              className={`${field} font-mono`}
              value={form.options[i]}
              onChange={e => set({ options: form.options.map((o, j) => (j === i ? e.target.value : o)) })}
            />
          </div>
        ))}
      </fieldset>
      <label className="block min-w-0">
        <span className={labelText}>Explanation</span>
        <textarea
          aria-label="Explanation"
          className={field}
          rows={3}
          value={form.explanation}
          onChange={e => set({ explanation: e.target.value })}
        />
      </label>
      {errors.length > 0 && (
        <ul role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400 list-disc pl-5">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className={`${button} bg-brand-600 hover:bg-brand-500 text-white`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className={`${button} text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
