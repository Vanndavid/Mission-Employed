
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createMockSession, fetchSession, generateMockReport } from '../services/apiClient';
import { LiveStatus, useLiveInterview } from '../hooks/useLiveInterview';
import { BehavioralAnswer, InterviewTurn, JobApplication } from '../types';

/**
 * Which interview is in progress. The session itself lives on the server in
 * `ai_sessions`; this is only the pointer, so a refresh can find it again.
 * The Express version kept the whole conversation in a server-side Map and
 * lost it on every restart -- persisting the id is what makes the move useful.
 */
const ACTIVE_MOCK_SESSION_KEY = 'mission_employed_mock_session';

/**
 * The pointer also records which application the interview was opened for
 * (null for a generic one), so "Mock for Acme" never resumes a different
 * interview that happened to be left open.
 */
interface StoredSession {
  id: number;
  appId: number | null;
}

function rememberSession(stored: StoredSession): void {
  try {
    localStorage.setItem(ACTIVE_MOCK_SESSION_KEY, JSON.stringify(stored));
  } catch {
    // A blocked or full localStorage costs the resume, not the interview.
  }
}

function forgetSession(): void {
  try {
    localStorage.removeItem(ACTIVE_MOCK_SESSION_KEY);
  } catch {
    // Nothing to do; the stale id is harmless and gets replaced on next start.
  }
}

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

function rememberedSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_MOCK_SESSION_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);

    // A bare id is the older format, from before sessions carried their application.
    if (isId(parsed)) return { id: parsed, appId: null };

    if (parsed && typeof parsed === 'object') {
      const { id, appId } = parsed as Record<string, unknown>;
      if (isId(id)) return { id, appId: isId(appId) ? appId : null };
    }
    return null;
  } catch {
    return null;
  }
}

/** The interview to resume on this screen, if the one left open is for the same application. */
function resumableSession(appId: number | null): number | null {
  const stored = rememberedSession();
  return stored !== null && stored.appId === appId ? stored.id : null;
}

/** While these hold, the interviewer has the floor and recording waits. */
const BUSY = new Set<LiveStatus>(['connecting', 'thinking', 'speaking']);

const RECORD_LABEL: Record<LiveStatus, string> = {
  offline: 'RECORD YOUR ANSWER',
  ready: 'RECORD YOUR ANSWER',
  recording: 'STOP RECORDING',
  connecting: 'CONNECTING...',
  thinking: 'INTERVIEWER THINKING...',
  speaking: 'INTERVIEWER SPEAKING...',
};

interface MockTestProps {
  applications: JobApplication[];
  behavioralAnswers: BehavioralAnswer[];
}

export const MockTest = ({ applications, behavioralAnswers }: MockTestProps) => {
  const [searchParams] = useSearchParams();
  const appIdParam = Number(searchParams.get('appId'));
  const appId = isId(appIdParam) ? appIdParam : null;
  const companyApp = useMemo(() => applications.find(a => a.id === appId), [applications, appId]);

  const companyContext = useMemo(() => {
    if (!companyApp) return undefined;
    const facts = behavioralAnswers
      .flatMap(a => a.bullets.filter(b => b.trim()))
      .slice(0, 10)
      .join('; ');
    return {
      company: companyApp.company,
      role: companyApp.role,
      jobDescription: companyApp.jobDescription || companyApp.notes,
      facts,
    };
  }, [companyApp, behavioralAnswers]);

  const [sessionActive, setSessionActive] = useState(false);
  // The interview now lives in ai_sessions rather than in this component, so
  // every turn is addressed by its server id.
  const [sessionId, setSessionId] = useState<number | null>(null);
  // What the server had when a refresh resumed the interview. Everything said
  // since arrives through the Live hook's exchanges.
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [starting, setStarting] = useState(false);
  const [sessionReport, setSessionReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [resuming, setResuming] = useState(() => resumableSession(appId) !== null);

  // The spoken interview runs over Gemini Live, so the voice streams as it is
  // generated instead of arriving seconds after the text.
  const live = useLiveInterview(sessionId);

  const scrollRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(() => {
    const said: InterviewTurn[] = [...history];
    for (const exchange of live.exchanges) {
      if (exchange.answer) said.push({ role: 'candidate', text: exchange.answer });
      if (exchange.reply) said.push({ role: 'interviewer', text: exchange.reply });
    }
    // The exchange in progress, filling in as Gemini transcribes it.
    if (live.draft.answer.trim()) said.push({ role: 'candidate', text: live.draft.answer });
    if (live.draft.reply.trim()) said.push({ role: 'interviewer', text: live.draft.reply });
    return said;
  }, [history, live.exchanges, live.draft]);

  const waiting = starting || live.status === 'connecting' || live.status === 'thinking';

  /**
   * Pick up an interview that a refresh interrupted. The transcript is read
   * back from the server rather than kept locally, so it is the same one the
   * model will be replayed on the next turn.
   */
  useEffect(() => {
    const stored = resumableSession(appId);
    if (stored === null) return;

    let cancelled = false;

    (async () => {
      try {
        const session = await fetchSession(stored);
        if (cancelled) return;

        setSessionId(session.id);
        setHistory(session.messages.map(message => ({
          role: message.role === 'model' ? 'interviewer' : 'candidate',
          text: message.content,
        })));
        setSessionActive(true);
      } catch {
        // Finished, deleted, or belonging to someone else: drop the pointer
        // rather than stranding the user on an interview they cannot continue.
        if (!cancelled) forgetSession();
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();

    return () => { cancelled = true; };
    // Mount only: a resume is a one-off on arrival, not something to redo per render.
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, waiting]);

  const startInterview = async () => {
    setSessionActive(true);
    setStarting(true);
    setHistory([]);
    try {
      const session = await createMockSession(companyContext);
      setSessionId(session.id);
      rememberSession({ id: session.id, appId });
      setStarting(false);
      await live.begin(session.id);
    } catch (e) {
      console.error(e);
      setStarting(false);
      setSessionActive(false);
    }
  };

  const terminateSession = async () => {
    const hadMeaningfulSession = turns.length > 1 && sessionId !== null;
    live.disconnect();
    if (hadMeaningfulSession) {
      setGeneratingReport(true);
      try {
        // The report reads the stored transcript, so the last exchange has to be in it.
        await live.settled();
        const report = await generateMockReport(sessionId);
        setSessionReport(report);
      } catch (e) {
        console.error(e);
      } finally {
        setGeneratingReport(false);
      }
    }
    setSessionActive(false);
    setSessionId(null);
    setHistory([]);
    forgetSession();
  };

  const dismissReport = () => setSessionReport(null);

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-120px)] flex flex-col space-y-8 pb-10">
      <header className="text-center shrink-0">
        <h2 className="text-4xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tighter italic">
          Role-Play Simulator
        </h2>
        <p className="text-slate-500 mt-1 font-medium italic">
          {companyApp
            ? `Company mode: ${companyApp.company} — ${companyApp.role}`
            : 'Speak naturally. The AI will probe for holes in your STAR narrative.'}
        </p>
      </header>

      {!sessionActive && !sessionReport ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-slate-800 p-10">
          <div className="w-24 h-24 bg-brand-600 rounded-full flex items-center justify-center text-4xl mb-8">👔</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase italic mb-4">Interview Mode</h3>
          <button
            onClick={startInterview}
            disabled={resuming}
            className="px-12 py-5 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all text-lg disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {resuming ? 'Resuming…' : 'Begin Session'}
          </button>
        </div>
      ) : sessionReport ? (
        <div className="flex-1 bg-slate-900 text-brand-50 rounded-[3rem] p-10 overflow-y-auto">
          <h3 className="text-2xl font-black text-brand-400 uppercase tracking-widest mb-6">Session Debrief</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{sessionReport}</div>
          <button
            onClick={dismissReport}
            className="mt-8 w-full py-4 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest"
          >
            Dismiss Report
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/50 rounded-[3rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-8">
            {turns.map((turn, i) => (
              <div key={i} className={`flex flex-col ${turn.role === 'interviewer' ? 'items-start' : 'items-end'}`}>
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
            ))}
            {waiting && (
              <div className="flex items-start">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl rounded-tl-none flex space-x-2 border border-slate-200 dark:border-slate-800">
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
          <div className="p-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center">
            {live.status === 'recording' ? (
              <button onClick={live.endAnswer} className="w-full max-w-sm py-6 bg-rose-600 text-white rounded-2xl font-black uppercase animate-pulse">
                STOP RECORDING
              </button>
            ) : (
              <button
                onClick={() => void live.startAnswer()}
                disabled={starting || BUSY.has(live.status)}
                className={`w-full max-w-sm py-6 rounded-2xl font-black uppercase ${
                  starting || BUSY.has(live.status)
                    ? 'bg-slate-100 text-slate-300'
                    : 'bg-brand-600 text-white hover:bg-brand-500'
                }`}
              >
                {starting ? 'CONNECTING...' : RECORD_LABEL[live.status]}
              </button>
            )}
            {live.error && (
              <p role="alert" className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400">{live.error}</p>
            )}
            <button
              onClick={terminateSession}
              disabled={generatingReport}
              className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-rose-500"
            >
              {generatingReport ? 'GENERATING REPORT...' : 'END SESSION & GET REPORT'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
