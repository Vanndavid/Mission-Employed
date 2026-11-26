import React, { useState } from 'react';
import { reportQuestion } from '../services/questionBankClient';
import { ApiError, errorMessage } from '../services/http';

type State = { step: 'closed' } | { step: 'open'; sending: boolean; error: string | null } | { step: 'done'; message: string };

/**
 * "Report this question": a quiet link under a practice verdict that sends a
 * reason to the admin's question bank. One open report per user per
 * question; a second is answered with the server's own sentence.
 */
export function ReportQuestion({ questionId }: { questionId: number }) {
  const [state, setState] = useState<State>({ step: 'closed' });
  const [reason, setReason] = useState('');

  if (state.step === 'done') {
    return <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{state.message}</p>;
  }

  if (state.step === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setState({ step: 'open', sending: false, error: null })}
        className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
      >
        Report this question
      </button>
    );
  }

  const send = async () => {
    setState({ step: 'open', sending: true, error: null });
    try {
      await reportQuestion(questionId, reason.trim());
      setState({ step: 'done', message: 'Thanks. An admin will look at this question.' });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setState({ step: 'done', message: cause.message });
      } else {
        setState({ step: 'open', sending: false, error: errorMessage(cause, 'Could not send the report. Try again.') });
      }
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">What is wrong with it?</span>
        <textarea
          value={reason}
          maxLength={1000}
          rows={2}
          autoFocus
          onChange={e => setReason(e.target.value)}
          placeholder="The answer should be B, because…"
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-xs font-bold text-rose-600 dark:text-rose-400">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={state.sending || reason.trim() === ''}
          onClick={() => void send()}
          className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold disabled:opacity-40"
        >
          {state.sending ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={() => setState({ step: 'closed' })}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
