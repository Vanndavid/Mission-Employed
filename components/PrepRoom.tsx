
import React, { useState, useRef } from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt, processAudioResponse, textToSpeech, evaluateSpeech } from '../services/geminiService';
import { decodeAudioPCM, decode } from '../utils';

interface PrepRoomProps {
  answers: BehavioralAnswer[];
  onUpdateAnswer: (themeId: string, bullets: string[]) => void;
}

export const PrepRoom = ({ answers, onUpdateAnswer }: PrepRoomProps) => {
  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeTheme = BEHAVIORAL_THEMES.find(t => t.id === activeThemeId)!;
  const activeAnswer = answers.find(a => a.themeId === activeThemeId) || { themeId: activeThemeId, bullets: [''] };

  const handleFetchChallenge = async () => {
    setIsProcessing(true);
    setTranscript('');
    setFeedback('');
    setError(null);
    try {
      const p = await generateBehavioralPrompt(activeTheme.label);
      const cleaned = p.replace(/^"(.*)"$/, '$1');
      setCurrentPrompt(cleaned);
      await playQuestion(cleaned);
    } catch (e) {
      setError("Failed to fetch challenge.");
    } finally {
      setIsProcessing(false);
    }
  };

  const playQuestion = async (text: string) => {
    setIsSpeaking(true);
    try {
      const base64Audio = await textToSpeech(text);
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (ctx.state === 'suspended') await ctx.resume();
        const audioBuffer = await decodeAudioPCM(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        return new Promise((resolve) => {
          source.onended = () => { setIsSpeaking(false); ctx.close(); resolve(true); };
          source.start();
        });
      }
    } catch (e) { console.error("Audio error:", e); }
    setIsSpeaking(false);
  };

  const startRecording = async () => {
    if (!currentPrompt) return;
    setError(null);
    setTranscript('');
    setFeedback('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processFinishedAudio(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("Microphone access is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const processFinishedAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const result = await processAudioResponse(base64Audio, activeTheme.label, currentPrompt);
        setTranscript(result.transcript);
        setFeedback(result.feedback);
        setIsProcessing(false);
      };
    } catch (e) {
      setError("Analysis failed. Please try again.");
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCurrentPrompt('');
    setTranscript('');
    setFeedback('');
    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-24">
      <header className="text-center">
        <h2 className="text-4xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tighter italic">Mechanical Drill</h2>
        <p className="text-slate-500 mt-2 font-medium">No timers. No distractions. Just your voice vs the AI recruiter.</p>
      </header>

      {/* Theme Selector */}
      <div className="flex flex-wrap justify-center gap-2">
        {BEHAVIORAL_THEMES.map(theme => (
          <button 
            key={theme.id}
            onClick={() => { setActiveThemeId(theme.id); reset(); }}
            className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              activeThemeId === theme.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl scale-105' : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200'
            }`}
          >
            {theme.label}
          </button>
        ))}
      </div>

      {/* Database Context */}
      <section className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] mb-6">Database Context: {activeTheme.label}</h3>
        <div className="space-y-3">
          {activeAnswer.bullets.map((bullet, idx) => (
            <input 
              key={idx}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 p-4 rounded-xl text-sm italic"
              placeholder="Enter impact fact..."
              value={bullet}
              onChange={(e) => {
                const nb = [...activeAnswer.bullets];
                nb[idx] = e.target.value;
                onUpdateAnswer(activeThemeId, nb);
              }}
            />
          ))}
          <button 
            onClick={() => onUpdateAnswer(activeThemeId, [...activeAnswer.bullets, ''])}
            className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 hover:underline"
          >+ Add Fact Entry</button>
        </div>
      </section>

      {/* Practice Interaction Area */}
      <section className="bg-slate-100 dark:bg-slate-950 p-12 rounded-[3rem] border-4 border-slate-200 dark:border-slate-800 border-dashed text-center space-y-10 relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center">
        
        {!currentPrompt && !isProcessing && (
          <button 
            onClick={handleFetchChallenge}
            className="px-12 py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all text-xl"
          >
            Generate Challenge Question
          </button>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center space-y-6">
            <div className="w-16 h-16 border-8 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xl font-black text-emerald-600 uppercase italic tracking-tighter">AI Recruiter is Processing...</p>
          </div>
        )}

        {currentPrompt && !isProcessing && !feedback && (
          <div className="w-full space-y-12 animate-in fade-in zoom-in duration-500">
            <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-emerald-500/20 shadow-xl max-w-2xl mx-auto">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-4">Interviewer Input:</span>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 italic leading-snug">"{currentPrompt}"</p>
            </div>

            <div className="flex flex-col items-center space-y-6">
              {isRecording ? (
                <button 
                  onClick={stopRecording}
                  className="w-72 py-8 bg-rose-600 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-[0_0_50px_rgba(225,29,72,0.3)] animate-pulse border-b-8 border-rose-800 active:translate-y-2 active:border-b-0 transition-all text-xl"
                >
                  DONE (STOP RECORDING)
                </button>
              ) : (
                <button 
                  onClick={startRecording}
                  disabled={isSpeaking}
                  className={`w-72 py-8 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl border-b-8 transition-all text-xl ${
                    isSpeaking 
                    ? 'bg-slate-200 text-slate-400 border-slate-300' 
                    : 'bg-emerald-600 text-white border-emerald-800 hover:bg-emerald-500'
                  }`}
                >
                  {isSpeaking ? 'LISTENING...' : 'RECORD ANSWER'}
                </button>
              )}
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">
                {isRecording ? "Recording your voice... Click DONE when finished." : "Answer using the STAR method (Situation, Task, Action, Result)."}
              </p>
            </div>
          </div>
        )}

        {error && <div className="p-4 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl font-black uppercase text-xs tracking-widest animate-bounce">⚠️ {error}</div>}

        {/* Results Display */}
        {feedback && !isProcessing && (
          <div className="w-full text-left space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 shadow-xl space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2 italic">Your Transcription</h4>
                <p className="text-slate-700 dark:text-slate-300 italic text-sm leading-relaxed whitespace-pre-wrap">
                  {transcript || "No audio detected."}
                </p>
              </div>
              <div className="bg-emerald-900 text-emerald-50 p-8 rounded-3xl shadow-2xl border border-emerald-700/50 space-y-6">
                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest border-b border-emerald-800 pb-2 italic">Executive Assessment</h4>
                <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                  {feedback}
                </div>
              </div>
            </div>
            <button 
              onClick={reset}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all border-b-4 border-slate-700 shadow-xl"
            >
              Terminate Session & Reset
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
