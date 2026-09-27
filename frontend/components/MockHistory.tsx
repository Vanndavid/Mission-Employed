import React, { useEffect, useState } from 'react';
import {
  AiSessionPayload,
  MockSessionSummary,
  deleteMockSession,
  fetchSession,
  generateMockReport,
  listMockSessions,
} from '../services/apiClient';
import { errorMessage } from '../services/http';
import { InterviewTurn } from '../types';

/**
 * Past mock interviews. Every transcript and report was already stored in
 * `ai_sessions`; this is the way back to them once the interview is over.
 */

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const titleOf = (context: { company?: unknown; role?: unknown } | null | undefined) => {
  const company = typeof context?.company === 'string' ? context.company.trim() : '';
  const role = typeof context?.role === 'string' ? context.role.trim() : '';
  return { title: company || 'General interview', subtitle: role };
};

/** One line of an interview, as shown live and in review. */
export const TurnBubble = ({ turn }: { turn: InterviewTurn }) => (
  <div className={`flex flex-col ${turn.role === 'interviewer' ? 'items-start' : 'items-end'}`}>
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2">
      {turn.role === 'interviewer' ? '👤 Interviewer' : '🎯 Candidate'}
    </span>
    <div className={`p-6 rounded-3xl max-w-[80%] text-sm leading-relaxed ${
      turn.role === 'interviewer'
        ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-tl-none'
        : 'bg-brand-600 text-white rounded-tr-none'
    }`}>
      {turn.text}
    </div>
  </div>
);

export const toTurns = (session: AiSessionPayload): InterviewTurn[] =>
  session.messages.map(message => ({
    role: message.role === 'model' ? 'interviewer' : 'candidate',
    text: message.content,
  }));

export const MockHistoryList = ({ onOpen }: { onOpen: (sessionId: number) => void }) => {
  const [sessions, setSessions] = useState<MockSessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMockSessions()
      .then(list => { if (!cancelled) setSessions(list); })
      .catch(() => { if (!cancelled) setError('Could not load your past interviews.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6">
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Past interviews</h3>
      {error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : sessions === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400">No past interviews yet. Finished ones will appear here to review.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sessions.map(session => {
            const { title, subtitle } = titleOf(session.context);
            return (
              <li key={session.id}>
                <button
                  onClick={() => onOpen(session.id)}
                  className="w-full flex items-center justify-between gap-4 py-3 px-2 text-left rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-800 dark:text-slate-100 truncate">{title}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {subtitle && `${subtitle} · `}{formatWhen(session.createdAt)} · {session.messageCount} messages
                    </span>
                  </span>
                  <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                    session.hasReport
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {session.hasReport ? 'Report' : 'No report'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

interface MockReviewProps {
  sessionId: number;
  /** Back to the list; also called once the interview has been deleted. */
  onBack: () => void;
}

export const MockReview = ({ sessionId, onBack }: MockReviewProps) => {
  const [session, setSession] = useState<AiSessionPayload | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'report' | 'delete' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSession(sessionId)
      .then(loaded => {
        if (cancelled) return;
        setSession(loaded);
        setReport(loaded.report?.text?.trim() || null);
      })
      .catch(() => { if (!cancelled) setError('Could not load this interview.'); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const writeReport = async () => {
    setBusy('report');
    setError(null);
    try {
      setReport(await generateMockReport(sessionId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this interview and its report? This cannot be undone.')) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteMockSession(sessionId);
      onBack();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const { title, subtitle } = titleOf(session?.context as { company?: unknown; role?: unknown } | null);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/50 rounded-[3rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between gap-4 px-8 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button onClick={onBack} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-brand-600">
          ← Back
        </button>
        <div className="min-w-0 text-center">
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{session ? title : ' '}</p>
          {session && (
            <p className="text-xs text-slate-500 truncate">
              {subtitle && `${subtitle} · `}{formatWhen(session.createdAt)}
            </p>
          )}
        </div>
        <button
          onClick={remove}
          disabled={!session || busy !== null}
          className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {error && <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>}
        {!session && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {session && (
          <>
            <section className="bg-slate-900 text-brand-50 rounded-[2rem] p-8">
              <h3 className="text-sm font-black text-brand-400 uppercase tracking-widest mb-4">Session Debrief</h3>
              {report ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{report}</div>
              ) : (
                <div>
                  <p className="text-sm text-slate-400 mb-4">This interview ended without a report.</p>
                  <button
                    onClick={writeReport}
                    disabled={busy !== null}
                    className="px-6 py-3 bg-brand-600 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-50"
                  >
                    {busy === 'report' ? 'Generating…' : 'Generate report'}
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Transcript</h3>
              {toTurns(session).map((turn, i) => <TurnBubble key={i} turn={turn} />)}
            </section>
          </>
        )}
      </div>
    </div>
  );
};
