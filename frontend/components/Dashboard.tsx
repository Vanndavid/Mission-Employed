import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CodingHistoryEntry, JobApplication, JobStatus, NewCodingAttempt } from '../types';
import { getLocalDateString } from '../utils';
import { computeWeakTopics, inferTopicsFromTitle } from '../utils/codingTopics';
import {
  CodingProblem,
  createCodingSession,
  generateCodingProblem,
  sendCodingChat,
} from '../services/apiClient';
import { ApiError, errorMessage } from '../services/http';
import { useAuth } from '../contexts/AuthContext';
import { useApplications, useCodingHistory } from '../contexts/DataProvider';
import { UpcomingInterviews } from './UpcomingInterviews';
import { PremiumGate } from './PremiumGate';

/**
 * Mission Control — software engineering coding practice with the AI tutor,
 * plus a read-only summary of everything else in flight.
 *
 * The side panels are the three the rebuild kept: recent attempts and weak
 * topics, the application pipeline, upcoming interviews. Streaks, hunt personas
 * and the daily task list went with the daily-protocol feature in Wave 1 and do
 * not come back.
 *
 * Coding practice is software engineering only — there is no career track to
 * branch on, here or in utils/codingTopics.
 */

type Difficulty = 'easy' | 'medium' | 'hard';

interface Message {
  role: 'tutor' | 'student';
  text: string;
}

/**
 * A tutor conversation in progress.
 *
 * The transcript belongs to the server: every turn is a row in `ai_messages`
 * and the model is replayed the whole thing on each turn, so the conversation
 * genuinely survives a refresh — carrying the same `sessionId` back is what
 * resumes it. There is no GET route for a session yet, so the browser keeps its
 * own copy of what to *render*; if that copy is lost the conversation still
 * continues, it just draws from wherever the transcript is picked back up.
 */
interface TutorSession {
  sessionId: string;
  difficulty: Difficulty;
  problem: CodingProblem;
  messages: Message[];
  /** Set once a finished attempt has been posted, so a resume cannot double-post. */
  recorded: boolean;
}

/**
 * Where the in-progress session is parked across a reload. This is the only
 * thing this screen keeps in localStorage — the application state blob is gone
 * and the API is the source of truth for everything else.
 */
const TUTOR_SESSION_KEY = 'mission_employed_coding_tutor';

interface StoredTutorSession extends TutorSession {
  /** Sessions are per-user on the server; another account's id would 404. */
  userId: number;
}

function readStoredSession(userId: number | null): TutorSession | null {
  if (userId === null) return null;
  try {
    const raw = localStorage.getItem(TUTOR_SESSION_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredTutorSession>;
    if (stored.userId !== userId) return null;
    if (typeof stored.sessionId !== 'string' || !stored.problem) return null;

    return {
      sessionId: stored.sessionId,
      difficulty: stored.difficulty ?? 'easy',
      problem: stored.problem,
      messages: Array.isArray(stored.messages) ? stored.messages : [],
      recorded: stored.recorded === true,
    };
  } catch {
    // Corrupt or unreadable storage is not worth failing a render over.
    return null;
  }
}

function writeStoredSession(userId: number, session: TutorSession): void {
  try {
    localStorage.setItem(TUTOR_SESSION_KEY, JSON.stringify({ userId, ...session }));
  } catch {
    /* private mode or storage disabled — the session just will not resume */
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(TUTOR_SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Fixed order for the pipeline summary, not whatever order the list arrived in. */
const PIPELINE_STATUSES: JobStatus[] = [
  JobStatus.SAVED,
  JobStatus.APPLIED,
  JobStatus.INTERVIEWING,
  JobStatus.OFFER,
  JobStatus.REJECTED,
];

const OPENING_LINE = (title: string) =>
  `Hello. I'm your interviewer for today. Let's look at "${title}". How would you approach this? Feel free to share your thoughts or initial code.`;

interface DashboardProps {
  applications: JobApplication[];
  codingHistory: CodingHistoryEntry[];
  onCodingComplete: (entry: NewCodingAttempt) => void | Promise<unknown>;
}

export const Dashboard = ({
  applications,
  codingHistory,
  onCodingComplete,
}: DashboardProps) => {
  const navigate = useNavigate();
  const { user, isPremium, refreshUser } = useAuth();

  // The records themselves still arrive as props from App; the providers are
  // read here only for the load and save status props cannot carry.
  const { loading: applicationsLoading } = useApplications();
  const {
    loading: historyLoading,
    error: historyError,
    saving: recordingAttempt,
  } = useCodingHistory();

  const resumedRef = useRef(false);
  const [session, setSession] = useState<TutorSession | null>(() => {
    const stored = readStoredSession(user?.id ?? null);
    resumedRef.current = stored !== null;
    return stored;
  });

  const [userMessage, setUserMessage] = useState('');
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Park the session so a refresh resumes it instead of starting blank.
  useEffect(() => {
    if (!user) return;
    if (session) writeStoredSession(user.id, session);
    else clearStoredSession();
  }, [session, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [session?.messages, isTutorThinking]);

  const weakTopics = useMemo(() => computeWeakTopics(codingHistory).slice(0, 5), [codingHistory]);
  const recentAttempts = useMemo(() => codingHistory.slice(0, 10), [codingHistory]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(PIPELINE_STATUSES.map(s => [s, 0])) as Record<JobStatus, number>;
    for (const app of applications) {
      if (counts[app.status] !== undefined) counts[app.status] += 1;
    }
    return counts;
  }, [applications]);

  /**
   * One place that turns a failed AI call into a sentence, off `ApiError`'s
   * flags rather than the message text: the tutor is premium-gated (403
   * `premium_required`) and Gemini outages are contained as 502
   * `ai_unavailable`, and those two deserve different answers.
   */
  const describeFailure = useCallback(
    (cause: unknown, fallback: string): string => {
      if (cause instanceof ApiError) {
        if (cause.isPremiumRequired) {
          // The server is the boundary; our copy of the plan is stale, so
          // re-read it and the panel below flips to the upgrade prompt.
          void refreshUser();
          return 'The AI tutor is a Premium feature and this account is not on Premium. Ask an admin to upgrade the plan.';
        }
        if (cause.isAiUnavailable) {
          return 'The AI service is not answering right now. Nothing was lost — try again in a moment.';
        }
      }
      return errorMessage(cause, fallback);
    },
    [refreshUser],
  );

  const startProblem = async (difficulty: Difficulty) => {
    setLoadingProblem(true);
    setTutorError(null);
    try {
      const problem = await generateCodingProblem(difficulty);
      const { sessionId } = await createCodingSession(problem.title, problem.description);

      resumedRef.current = false;
      setUserMessage('');
      setSession({
        sessionId,
        difficulty,
        problem,
        // The server stores nothing until the first student turn, so the
        // opening line is ours and is part of the transcript we keep.
        messages: [{ role: 'tutor', text: OPENING_LINE(problem.title) }],
        recorded: false,
      });
    } catch (cause) {
      // A failed start leaves any conversation already on screen alone.
      setTutorError(describeFailure(cause, 'Could not start a tutoring session.'));
    } finally {
      setLoadingProblem(false);
    }
  };

  const sendMessage = async (customMessage?: string) => {
    const text = (customMessage ?? userMessage).trim();
    if (!session || !text || isTutorThinking) return;

    const active = session;
    setSession({ ...active, messages: [...active.messages, { role: 'student', text }] });
    if (!customMessage) setUserMessage('');
    setIsTutorThinking(true);
    setTutorError(null);

    try {
      const reply = await sendCodingChat(active.sessionId, text);
      const finished = !active.recorded && /mission accomplished/i.test(reply);

      setSession(current => {
        if (!current || current.sessionId !== active.sessionId) return current;
        return {
          ...current,
          messages: [...current.messages, { role: 'tutor', text: reply }],
          recorded: current.recorded || finished,
        };
      });

      if (finished) {
        const topics = active.problem.topics?.length
          ? active.problem.topics
          : inferTopicsFromTitle(active.problem.title);

        // POSTs to /api/coding/attempts through the provider, which owns the
        // error state — this screen does not need to catch it twice.
        void onCodingComplete({
          date: getLocalDateString(),
          difficulty: active.difficulty,
          title: active.problem.title,
          completed: true,
          topics,
        });
      }
    } catch (cause) {
      // A turn is only persisted once the model has answered, so a failure left
      // nothing on the server. Take the message back out of the transcript and
      // hand the text back to the box rather than inventing a tutor reply.
      setSession(current =>
        current && current.sessionId === active.sessionId
          ? { ...current, messages: active.messages }
          : current,
      );
      if (!customMessage) setUserMessage(text);

      if (cause instanceof ApiError && cause.isNotFound) {
        setSession(null);
        setTutorError('That tutoring session is no longer on the server. Start a new problem to pick up again.');
      } else {
        setTutorError(describeFailure(cause, 'Could not reach the tutor.'));
      }
    } finally {
      setIsTutorThinking(false);
    }
  };

  const difficultyButton = (difficulty: Difficulty, label: string, className: string) => (
    <button
      onClick={() => void startProblem(difficulty)}
      className={className}
      disabled={loadingProblem || isTutorThinking}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Software engineering coding practice with an AI tutor, and where the rest of the hunt stands.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-[700px]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Coding Tutor
              </h3>
              {isPremium && (
                <div className="space-x-2">
                  {difficultyButton(
                    'easy',
                    'New Easy',
                    'px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-bold transition-colors text-slate-700 dark:text-slate-200 disabled:opacity-50',
                  )}
                  {difficultyButton(
                    'medium',
                    'New Medium',
                    'px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-bold transition-colors disabled:opacity-50',
                  )}
                  {difficultyButton(
                    'hard',
                    'New Hard',
                    'px-3 py-1 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-bold transition-colors disabled:opacity-50',
                  )}
                </div>
              )}
            </div>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate title="AI coding tutor (Premium)" />
              </div>
            ) : (
              <>
                {tutorError && (
                  <div
                    role="alert"
                    className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-600 dark:text-rose-400 font-bold"
                  >
                    {tutorError}
                  </div>
                )}
                {loadingProblem ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                    Establishing Mentor Connection...
                  </div>
                ) : session ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
                      <h4 className="font-bold text-brand-600 dark:text-brand-400 mb-1">{session.problem.title}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {session.problem.description}
                      </p>
                      {resumedRef.current && (
                        <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">
                          Resumed session · the tutor still has this conversation
                        </p>
                      )}
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 no-scrollbar">
                      {session.messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'tutor' ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                              msg.role === 'tutor'
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                                : 'bg-brand-600 text-white rounded-tr-none shadow-md'
                            }`}
                          >
                            <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                          </div>
                        </div>
                      ))}
                      {isTutorThinking && (
                        <div className="flex justify-start">
                          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none flex space-x-1 items-center">
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 shrink-0">
                      <textarea
                        className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:outline-none focus:border-brand-500 transition-colors text-sm font-mono text-slate-800 dark:text-slate-200 resize-none"
                        placeholder="Type your code or ask a question..."
                        value={userMessage}
                        onChange={e => setUserMessage(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.metaKey) void sendMessage();
                        }}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => void sendMessage('Can you give me a small hint to move forward?')}
                          disabled={isTutorThinking}
                          className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                        >
                          💡 Request Hint
                        </button>
                        <button
                          onClick={() => void sendMessage()}
                          disabled={isTutorThinking || !userMessage.trim()}
                          className={`flex-[2] py-3 rounded-xl font-bold transition-all flex items-center justify-center ${
                            isTutorThinking || !userMessage.trim()
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                              : 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-600/10'
                          }`}
                        >
                          Send Message
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm italic space-y-4">
                    <div className="text-6xl grayscale opacity-20">👨‍🏫</div>
                    <p>The Tutoring Lab is ready. Initialize a mission to begin.</p>
                    <button
                      onClick={() => void startProblem('easy')}
                      disabled={loadingProblem}
                      className="bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 dark:text-brand-400 px-6 py-2 rounded-full font-bold transition-all disabled:opacity-50"
                    >
                      Start New Session
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <UpcomingInterviews applications={applications} onSelectApp={id => navigate(`/applications?prep=${id}`)} />

          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold flex items-center">
                <span className="mr-2">📁</span> Pipeline
              </h3>
              <button
                onClick={() => navigate('/applications')}
                className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400 hover:underline"
              >
                Open
              </button>
            </div>

            {applicationsLoading ? (
              <p className="text-sm text-slate-400 italic animate-pulse">Loading applications…</p>
            ) : applications.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No applications tracked yet.</p>
            ) : (
              <>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {applications.length}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">tracked</span>
                </p>
                <div className="mt-4 space-y-2">
                  {PIPELINE_STATUSES.map(status => (
                    <div key={status} className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{status}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{statusCounts[status]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {weakTopics.length > 0 && (
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-amber-300 dark:border-amber-500/30 shadow-sm">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <span className="mr-2">⚠️</span> Weak Topics
              </h3>
              <div className="space-y-2">
                {weakTopics.map(w => (
                  <div key={w.topic} className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{w.topic}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">
                      {w.completionRate}% ({w.completed}/{w.attempted})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold flex items-center">
                <span className="mr-2">📚</span> Recent Attempts
              </h3>
              {recordingAttempt && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse">
                  Saving…
                </span>
              )}
            </div>

            {historyError ? (
              <p className="text-sm text-rose-600 dark:text-rose-400 font-bold">{historyError}</p>
            ) : historyLoading ? (
              <p className="text-sm text-slate-400 italic animate-pulse">Loading attempts…</p>
            ) : recentAttempts.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No attempts yet. Start a problem to log one.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentAttempts.map((entry, i) => (
                  <div
                    key={entry.id ?? `${entry.date}-${i}`}
                    className="flex justify-between items-start text-sm border-b border-slate-100 dark:border-slate-800 pb-2"
                  >
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{entry.title}</p>
                      <p className="text-[10px] text-slate-400 uppercase">
                        {entry.date} · {entry.difficulty} · {entry.topics.join(', ') || 'General'}
                      </p>
                    </div>
                    <span className={`text-xs font-bold ${entry.completed ? 'text-brand-600' : 'text-slate-400'}`}>
                      {entry.completed ? '✓' : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
