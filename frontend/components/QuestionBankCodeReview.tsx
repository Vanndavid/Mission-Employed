import React, { useState } from 'react';
import { CodeReviewCategory } from '../types/codeReview';
import { PracticeLanguage, QuizCatalog } from '../types/practice';
import { AdminQuestion, PlantedIssue } from '../types/questionBank';
import {
  blankIssue,
  CODE_REVIEW_CATEGORIES,
  CodeReviewForm,
  MAX_PLANTED_ISSUES,
  plantedIssues,
  PlantedIssueForm,
  toCodeReviewForm,
  toCodeReviewPatch,
} from '../utils/questionDraft';
import { CodeSnippet } from './CodeSnippet';
import { DifficultySelect, field, labelText, button, SaveBar, useQuestionSave } from './QuestionBankForm';

/**
 * A code review snippet on Admin · Question bank. The admin checks a draft
 * the way a reviewer will meet it: the snippet with every planted issue
 * highlighted on its lines and spelled out under its last one, so a range
 * that is a line out shows before anyone is scored against it.
 */

const severityLabel = (severity: number) => `severity ${severity}`;

/** The issues that cover a line. */
const onLine = (issues: { lines: [number, number] }[], line: number) =>
  issues.filter(issue => line >= issue.lines[0] && line <= issue.lines[1]);

function IssueNote({ issue }: { issue: PlantedIssue }) {
  return (
    <span className="block rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-slate-800 dark:text-slate-100">
      <span className="block text-xs font-bold text-amber-900 dark:text-amber-200">
        <span className="font-mono">{issue.id}</span> · lines {issue.lines[0]}–{issue.lines[1]} · {issue.category} ·{' '}
        {severityLabel(issue.severity)}
      </span>
      <span className="block">{issue.summary}</span>
      <span className="block text-slate-600 dark:text-slate-300">Fix: {issue.fix}</span>
    </span>
  );
}

/** The snippet as a reviewer sees it, with the key laid over it. */
export function CodeReviewReview({ question }: { question: AdminQuestion }) {
  const issues = plantedIssues(question);
  const code = question.code ?? '';
  const lineCount = code.replace(/\n+$/, '').split('\n').length;
  const offTheSnippet = issues.filter(issue => issue.lines[1] > lineCount || issue.lines[0] < 1);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-bold text-slate-900 dark:text-slate-50">{question.topic}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{question.prompt}</p>
      </div>
      {code && (
        <CodeSnippet
          code={code}
          label="Snippet"
          wrap
          lineClassName={line => (onLine(issues, line).length ? 'bg-amber-500/15' : undefined)}
          renderAfterLine={line => {
            const ending = issues.filter(issue => issue.lines[1] === line);
            return ending.length ? (
              <span className="block space-y-2">
                {ending.map(issue => (
                  <IssueNote key={issue.id} issue={issue} />
                ))}
              </span>
            ) : null;
          }}
        />
      )}
      {offTheSnippet.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">Not on the snippet's lines:</p>
          {offTheSnippet.map(issue => (
            <IssueNote key={issue.id} issue={issue} />
          ))}
        </div>
      )}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-1 text-sm">
        <p className={labelText}>
          {issues.length} planted {issues.length === 1 ? 'issue' : 'issues'} · takeaway
        </p>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{question.explanation}</p>
      </div>
    </div>
  );
}

/** The code review editor: the snippet and its planted issues. The server checks the whole snippet on Save. */
export function CodeReviewEditor({
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
  const [form, setForm] = useState<CodeReviewForm>(() => toCodeReviewForm(question));
  const { saving, errors, save } = useQuestionSave(question.id, onSaved);
  const set = (patch: Partial<CodeReviewForm>) => setForm(prev => ({ ...prev, ...patch }));
  const setIssue = (index: number, patch: Partial<PlantedIssueForm>) =>
    setForm(prev => ({ ...prev, issues: prev.issues.map((issue, i) => (i === index ? { ...issue, ...patch } : issue)) }));
  const ranges = form.issues.map(issue => ({ lines: [issue.start, issue.end] as [number, number] }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block min-w-0 sm:col-span-1">
          <span className={labelText}>Language</span>
          <select
            aria-label="Language"
            className={field}
            value={form.language}
            onChange={e => set({ language: e.target.value as PracticeLanguage })}
          >
            {(catalog?.languages ?? []).map(l => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
            {!catalog?.languages.some(l => l.key === form.language) && <option value={form.language}>{form.language}</option>}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelText}>Title</span>
          <input aria-label="Title" className={field} maxLength={64} value={form.title} onChange={e => set({ title: e.target.value })} />
        </label>
        <DifficultySelect value={form.difficulty} onChange={difficulty => set({ difficulty })} />
      </div>
      <label className="block min-w-0">
        <span className={labelText}>What the code is meant to do</span>
        <textarea aria-label="Prompt" className={field} rows={2} value={form.prompt} onChange={e => set({ prompt: e.target.value })} />
      </label>
      <label className="block min-w-0">
        <span className={labelText}>Code (20 to 80 lines, spaces not tabs)</span>
        <textarea
          aria-label="Code"
          className={`${field} font-mono text-[13px]`}
          rows={Math.min(16, Math.max(6, form.code.split('\n').length + 1))}
          spellCheck={false}
          value={form.code}
          onChange={e => set({ code: e.target.value })}
        />
      </label>
      {form.code.trim() !== '' && (
        <div>
          <p className={labelText}>The issues' lines, as reviewers will number them</p>
          <CodeSnippet
            code={form.code}
            label="Preview"
            wrap
            lineClassName={line => (onLine(ranges, line).length ? 'bg-amber-500/15' : undefined)}
          />
        </div>
      )}
      <fieldset className="space-y-3">
        <legend className={labelText}>Planted issues (2 to 6)</legend>
        {form.issues.map((issue, i) => {
          const n = i + 1;
          return (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <label className="block min-w-0 col-span-2 sm:col-span-1">
                  <span className={labelText}>Id</span>
                  <input
                    aria-label={`Issue ${n} id`}
                    className={`${field} font-mono`}
                    placeholder="sql-injection"
                    value={issue.id}
                    onChange={e => setIssue(i, { id: e.target.value })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={labelText}>From line</span>
                  <input
                    aria-label={`Issue ${n} first line`}
                    type="number"
                    min={1}
                    className={field}
                    value={issue.start}
                    onChange={e => setIssue(i, { start: Number(e.target.value) })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={labelText}>To line</span>
                  <input
                    aria-label={`Issue ${n} last line`}
                    type="number"
                    min={1}
                    className={field}
                    value={issue.end}
                    onChange={e => setIssue(i, { end: Number(e.target.value) })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={labelText}>Category</span>
                  <select
                    aria-label={`Issue ${n} category`}
                    className={field}
                    value={issue.category}
                    onChange={e => setIssue(i, { category: e.target.value as CodeReviewCategory })}
                  >
                    {CODE_REVIEW_CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    {issue.category === '' && <option value="">none</option>}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className={labelText}>Severity</span>
                  <select
                    aria-label={`Issue ${n} severity`}
                    className={field}
                    value={issue.severity}
                    onChange={e => setIssue(i, { severity: Number(e.target.value) })}
                  >
                    {[1, 2, 3].map(severity => (
                      <option key={severity} value={severity}>
                        {severity === 1 ? '1 · minor' : severity === 3 ? '3 · serious' : '2'}
                      </option>
                    ))}
                    {![1, 2, 3].includes(issue.severity) && <option value={issue.severity}>{issue.severity}</option>}
                  </select>
                </label>
              </div>
              <label className="block min-w-0">
                <span className={labelText}>What is wrong</span>
                <textarea
                  aria-label={`Issue ${n} summary`}
                  className={field}
                  rows={2}
                  value={issue.summary}
                  onChange={e => setIssue(i, { summary: e.target.value })}
                />
              </label>
              <label className="block min-w-0">
                <span className={labelText}>Fix</span>
                <textarea
                  aria-label={`Issue ${n} fix`}
                  className={field}
                  rows={2}
                  value={issue.fix}
                  onChange={e => setIssue(i, { fix: e.target.value })}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove issue ${n}`}
                onClick={() => set({ issues: form.issues.filter((_, j) => j !== i) })}
                className={`${button} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          disabled={form.issues.length >= MAX_PLANTED_ISSUES}
          onClick={() => set({ issues: [...form.issues, blankIssue()] })}
          className={`${button} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
        >
          Add an issue
        </button>
      </fieldset>
      <label className="block min-w-0">
        <span className={labelText}>Takeaway, shown after a review is scored</span>
        <textarea
          aria-label="Takeaway"
          className={field}
          rows={3}
          value={form.explanation}
          onChange={e => set({ explanation: e.target.value })}
        />
      </label>
      <SaveBar saving={saving} errors={errors} onSave={() => void save(toCodeReviewPatch(form))} onCancel={onCancel} />
    </div>
  );
}
