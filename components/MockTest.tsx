
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conductInterviewTurn, textToSpeech, generateMockReport } from '../services/apiClient';
import { decodeAudioPCM, decode } from '../utils';
import { BehavioralAnswer, InterviewTurn, JobApplication } from '../types';

interface MockTestProps {
  applications: JobApplication[];
  behavioralAnswers: BehavioralAnswer[];
}

export const MockTest = ({ applications, behavioralAnswers }: MockTestProps) => {
  const [searchParams] = useSearchParams();
  const appId = searchParams.get('appId');
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
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  const [sessionReport, setSessionReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, isProcessing]);

  const speak = async (text: string) => {
    setIsInterviewerSpeaking(true);
    try {
      const base64Audio = await textToSpeech(text);
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();
        const audioBuffer = await decodeAudioPCM(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        return new Promise(resolve => {
          source.onended = () => { setIsInterviewerSpeaking(false); resolve(true); };
          source.start();
        });
      }
    } catch (e) {
      console.error('Speech Error:', e);
      setIsInterviewerSpeaking(false);
    }
  };

  const startInterview = async () => {
    setSessionActive(true);
    setIsProcessing(true);
    setHistory([]);
    try {
      const initialPrompt = companyApp
        ? `Hello. Thank you for interviewing for the ${companyApp.role} position at ${companyApp.company}. To start, could you tell me about a time you dealt with a significant technical challenge relevant to this role?`
        : 'Hello. Thank you for joining us today. To start off, could you tell me about a time you had to deal with a significant technical challenge in a professional setting?';
      setHistory([{ role: 'interviewer', text: initialPrompt }]);
      await speak(initialPrompt);
    } catch (e) {
      console.error(e);
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
    if (history.length > 1) {
      setGeneratingReport(true);
      try {
        const report = await generateMockReport(history, companyContext);
        setSessionReport(report);
      } catch (e) {
        console.error(e);
      } finally {
        setGeneratingReport(false);
      }
    }
    setSessionActive(false);
    setHistory([]);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const dismissReport = () => setSessionReport(null);

  const handleTurn = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const result = await conductInterviewTurn(history, base64Audio, companyContext);
        setHistory(prev => [
          ...prev,
          { role: 'candidate', text: result.transcript },
          { role: 'interviewer', text: result.nextPrompt },
        ]);
        setIsProcessing(false);
        setTimeout(() => speak(result.nextPrompt), 100);
      };
    } catch (e) {
      console.error(e);
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
          <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center text-4xl mb-8">👔</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase italic mb-4">Interview Mode</h3>
          <button
            onClick={startInterview}
            className="px-12 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all text-lg"
          >
            Begin Session
          </button>
        </div>
      ) : sessionReport ? (
        <div className="flex-1 bg-slate-900 text-emerald-50 rounded-[3rem] p-10 overflow-y-auto">
          <h3 className="text-2xl font-black text-emerald-400 uppercase tracking-widest mb-6">Session Debrief</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{sessionReport}</div>
          <button
            onClick={dismissReport}
            className="mt-8 w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest"
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
                    : 'bg-emerald-600 text-white rounded-tr-none'
                }`}>
                  {turn.text}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl rounded-tl-none flex space-x-2 border border-slate-200 dark:border-slate-800">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
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
