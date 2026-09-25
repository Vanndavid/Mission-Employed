
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conductMockTurn, createMockSession, fetchSession, generateMockReport, textToSpeech } from '../services/apiClient';
import { playSpokenClip } from '../utils/speech';
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
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  const [sessionReport, setSessionReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [resuming, setResuming] = useState(() => resumableSession(appId) !== null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  }, [history, isProcessing]);

  const speak = async (text: string) => {
    setIsInterviewerSpeaking(true);
    try {
      // The API answers with a complete WAV, so this goes straight to an
      // <audio> element -- no PCM decoding, no hand-built header.
      const base64Audio = await textToSpeech(text);
      if (base64Audio) await playSpokenClip(base64Audio);
    } catch (e) {
      console.error('Speech Error:', e);
    } finally {
      setIsInterviewerSpeaking(false);
    }
  };

  const startInterview = async () => {
    setSessionActive(true);
    setIsProcessing(true);
    setHistory([]);
    try {
      const session = await createMockSession(companyContext);
      setSessionId(session.id);
      rememberSession({ id: session.id, appId });

      // An opening turn with no audio and no typed answer asks the model for
      // the first question, and stores it on the session.
      const { nextPrompt } = await conductMockTurn(session.id);
      const initialPrompt = nextPrompt || (companyApp
        ? `Hello. Thank you for interviewing for the ${companyApp.role} position at ${companyApp.company}. To start, could you tell me about a time you dealt with a significant technical challenge relevant to this role?`
        : 'Hello. Thank you for joining us today. To start off, could you tell me about a time you had to deal with a significant technical challenge in a professional setting?');
      setHistory([{ role: 'interviewer', text: initialPrompt }]);
      await speak(initialPrompt);
    } catch (e) {
      console.error(e);
      setSessionActive(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        handleTurn(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert('Microphone required for Mock Test.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const terminateSession = async () => {
    const hadMeaningfulSession = history.length > 1 && sessionId !== null;
    if (hadMeaningfulSession) {
      setGeneratingReport(true);
      try {
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

  const readAsBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const handleTurn = async (blob: Blob) => {
    if (sessionId === null) return;
    setIsProcessing(true);
    try {
      const base64Audio = await readAsBase64(blob);
      const result = await conductMockTurn(sessionId, { audioBase64: base64Audio });
      setHistory(prev => [
        ...prev,
        { role: 'candidate', text: result.transcript },
        { role: 'interviewer', text: result.nextPrompt },
      ]);
      setTimeout(() => speak(result.nextPrompt), 100);
    } catch (e) {
      // Before, a failed turn threw inside onloadend, outside this try, and
      // left the screen on "PROCESSING..." for good. Now the answer can be re-recorded.
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

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
            {history.map((turn, i) => (
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
            {isProcessing && (
              <div className="flex items-start">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl rounded-tl-none flex space-x-2 border border-slate-200 dark:border-slate-800">
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
          <div className="p-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center">
            {isRecording ? (
              <button onClick={stopRecording} className="w-full max-w-sm py-6 bg-rose-600 text-white rounded-2xl font-black uppercase animate-pulse">
                STOP RECORDING
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={isInterviewerSpeaking || isProcessing}
                className={`w-full max-w-sm py-6 rounded-2xl font-black uppercase ${
                  isInterviewerSpeaking || isProcessing
                    ? 'bg-slate-100 text-slate-300'
                    : 'bg-brand-600 text-white hover:bg-brand-500'
                }`}
              >
                {isInterviewerSpeaking ? 'INTERVIEWER SPEAKING...' : isProcessing ? 'PROCESSING...' : 'RECORD YOUR ANSWER'}
              </button>
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
