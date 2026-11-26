import React, { useState } from 'react';
import { AdminQuestion } from '../types/questionBank';
import { scenarioKeyPoints, SYSTEM_DESIGN_TRAITS, SystemDesignForm, toSystemDesignForm, toSystemDesignPatch } from '../utils/questionDraft';
import { DifficultySelect, field, labelText, SaveBar, useQuestionSave } from './QuestionBankForm';

/**
 * A system design scenario on Admin · Question bank: the scenario as a user
 * is served it, then the key points an answer is rated against, trait by
 * trait, and what the scenario tests.
 */
export function SystemDesignReview({ question }: { question: AdminQuestion }) {
  const keyPoints = scenarioKeyPoints(question);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-bold text-slate-900 dark:text-slate-50">{question.topic}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{question.prompt}</p>
      </div>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3 text-sm">
        <p className={labelText}>Key points an answer is rated against</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {SYSTEM_DESIGN_TRAITS.map(trait => (
            <div key={trait.key} className="min-w-0">
              <dt className="font-semibold text-slate-800 dark:text-slate-100">{trait.label}</dt>
              <dd>
                {keyPoints[trait.key].length > 0 ? (
                  <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">
                    {keyPoints[trait.key].map(point => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">None</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <p className={labelText}>What it tests, shown after scoring</p>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{question.explanation}</p>
        </div>
      </div>
    </div>
  );
}

/** The system design editor: the scenario and its key points, one a line. The server checks it all on Save. */
export function SystemDesignEditor({
  question,
  onCancel,
  onSaved,
}: {
  question: AdminQuestion;
  onCancel: () => void;
  onSaved: (question: AdminQuestion) => void;
}) {
  const [form, setForm] = useState<SystemDesignForm>(() => toSystemDesignForm(question));
  const { saving, errors, save } = useQuestionSave(question.id, onSaved);
  const set = (patch: Partial<SystemDesignForm>) => setForm(prev => ({ ...prev, ...patch }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block min-w-0 sm:col-span-2">
          <span className={labelText}>Title</span>
          <input aria-label="Title" className={field} maxLength={64} value={form.title} onChange={e => set({ title: e.target.value })} />
        </label>
        <DifficultySelect value={form.difficulty} onChange={difficulty => set({ difficulty })} />
      </div>
      <label className="block min-w-0">
        <span className={labelText}>Scenario, with its scale numbers</span>
        <textarea aria-label="Prompt" className={field} rows={4} value={form.prompt} onChange={e => set({ prompt: e.target.value })} />
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className={`${labelText} mb-2`}>Key points, one a line (2 to 6 for every trait)</legend>
        {SYSTEM_DESIGN_TRAITS.map(trait => (
          <label key={trait.key} className="block min-w-0">
            <span className={labelText}>{trait.label}</span>
            <textarea
              aria-label={`${trait.label} key points`}
              className={field}
              rows={Math.min(7, Math.max(3, form.keyPoints[trait.key].split('\n').length + 1))}
              value={form.keyPoints[trait.key]}
              onChange={e => set({ keyPoints: { ...form.keyPoints, [trait.key]: e.target.value } })}
            />
          </label>
        ))}
      </fieldset>
      <label className="block min-w-0">
        <span className={labelText}>What it tests, shown after scoring</span>
        <textarea
          aria-label="Explanation"
          className={field}
          rows={3}
          value={form.explanation}
          onChange={e => set({ explanation: e.target.value })}
        />
      </label>
      <SaveBar saving={saving} errors={errors} onSave={() => void save(toSystemDesignPatch(form))} onCancel={onCancel} />
    </div>
  );
}
