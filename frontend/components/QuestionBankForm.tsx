import React, { useState } from 'react';
import { updateQuestion } from '../services/questionBankClient';
import { ApiError, errorMessage } from '../services/http';
import { PracticeDifficulty } from '../types/practice';
import { AdminQuestion, QuestionPatch } from '../types/questionBank';

/** What every editor on Admin · Question bank shares, whatever the kind. */

export const DIFFICULTIES: PracticeDifficulty[] = ['easy', 'medium', 'hard'];

export const field =
  'w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100';
export const labelText = 'text-[10px] font-bold uppercase tracking-widest text-slate-400';
export const button = 'px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40';

/**
 * Saves a whole question. When the server's checks refuse it, every reason
 * they gave is kept for the form to list (a field can have several, as
 * `answer`, `answer.1`, …), and the form stays open.
 */
export function useQuestionSave(id: number, onSaved: (question: AdminQuestion) => void) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const save = async (patch: QuestionPatch) => {
    setSaving(true);
    setErrors([]);
    try {
      onSaved(await updateQuestion(id, patch));
    } catch (e) {
      const fieldErrors = e instanceof ApiError && e.errors ? Object.values(e.errors).flat() : [];
      setErrors(fieldErrors.length ? fieldErrors : [errorMessage(e, 'Could not save the question.')]);
    } finally {
      setSaving(false);
    }
  };

  return { saving, errors, save };
}

/** The checks' reasons, then Save and Cancel. */
export function SaveBar({
  saving,
  errors,
  onSave,
  onCancel,
}: {
  saving: boolean;
  errors: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {errors.length > 0 && (
        <ul role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400 list-disc pl-5">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={onSave} className={`${button} bg-brand-600 hover:bg-brand-500 text-white`}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className={`${button} text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800`}>
          Cancel
        </button>
      </div>
    </>
  );
}

export function DifficultySelect({
  value,
  onChange,
}: {
  value: PracticeDifficulty;
  onChange: (difficulty: PracticeDifficulty) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelText}>Difficulty</span>
      <select aria-label="Difficulty" className={field} value={value} onChange={e => onChange(e.target.value as PracticeDifficulty)}>
        {DIFFICULTIES.map(d => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}
