
import React, { useState, useRef, useEffect } from 'react';
import { conductInterviewTurn, textToSpeech } from '../services/geminiService';
import { decodeAudioPCM, decode } from '../utils';
import { InterviewTurn } from '../types';

export const MockTest = () => {
  const [sessionActive, setSessionActive] = useState(false);
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
        
        return new Promise((resolve) => {
          source.onended = () => {
            setIsInterviewerSpeaking(false);
            resolve(true);
          };
          source.start();
        });
      }
    } catch (e) { 
      console.error("Speech Error:", e);
      setIsInterviewerSpeaking(false);
    }
  };

  const startInterview = async () => {
    setSessionActive(true);
    setIsProcessing(true);
    setHistory([]);
    try {
      const initialPrompt = "Hello. Thank you for joining us today. To start off, could you tell me about a time you had to deal with a significant technical challenge in a professional setting?";
      const initialTurn: InterviewTurn = { role: 'interviewer', text: initialPrompt };
      setHistory([initialTurn]);
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
      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        handleTurn(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      alert("Microphone required for Mock Test.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleTurn = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const result = await conductInterviewTurn(history, base64Audio);
        
        const candidateTurn: InterviewTurn = { 
          role: 'candidate', 
          text: result.transcript
        };
        const interviewerTurn: InterviewTurn = { 
          role: 'interviewer', 
          text: result.nextPrompt 
        };

        setHistory(prev => [...prev, candidateTurn, interviewerTurn]);
        setIsProcessing(false);
        
        // Wait for the next render to complete before speaking to ensure UI sync
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
        <h2 className="text-4xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tighter italic">Role-Play Simulator</h2>
        <p className="text-slate-500 mt-1 font-medium italic">Speak naturally. The AI will probe for holes in your STAR narrative.</p>
      </header>

      {!sessionActive ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-slate-800 shadow-inner p-10">
           <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center text-4xl mb-8 animate-bounce">👔</div>
           <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase italic tracking-tighter mb-4">Interview Mode Engaged</h3>
           <p className="text-slate-500 max-w-sm text-center mb-10 text-sm leading-relaxed font-medium">
             The interviewer will ask a question. If your response is vague, be prepared for follow-ups.
           </p>
           <button 
             onClick={startInterview}
             className="px-12 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all text-lg border-b-8 border-emerald-800"
           >
             Begin Session
           </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/50 rounded-[3rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar"
          >
            {history.map((turn, i) => (
              <div key={i} className={`flex flex-col ${turn.role === 'interviewer' ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center space-x-3 mb-2 px-2">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                     {turn.role === 'interviewer' ? '👤 Interviewer' : '🎯 Candidate'}
                   </span>
                </div>
                <div className={`p-6 rounded-3xl max-w-[80%] text-sm leading-relaxed shadow-sm ${
                  turn.role === 'interviewer' 
                  ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none' 
                  : 'bg-emerald-600 text-white rounded-tr-none'
                }`}>
                  {turn.text}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-start">
                 <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl rounded-tl-none flex space-x-2 items-center shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
              </div>
            )}
          </div>

          <div className="p-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 text-center flex flex-col items-center">
             {isRecording ? (
               <button 
                onClick={stopRecording}
                className="w-full max-w-sm py-6 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl animate-pulse border-b-8 border-rose-800 active:translate-y-2 transition-all"
               >
                 STOP RECORDING
               </button>
             ) : (
               <button 
                 onClick={startRecording}
                 disabled={isInterviewerSpeaking || isProcessing}
                 className={`w-full max-w-sm py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl border-b-8 transition-all ${
                   isInterviewerSpeaking || isProcessing
                   ? 'bg-slate-100 text-slate-300 border-slate-200'
                   : 'bg-emerald-600 text-white border-emerald-800 hover:bg-emerald-500'
                 }`}
               >
                 {isInterviewerSpeaking ? 'INTERVIEWER SPEAKING...' : isProcessing ? 'PROCESSING...' : 'RECORD YOUR ANSWER'}
               </button>
             )}
             <div className="mt-4 flex items-center space-x-6 text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-widest">STATUS: {isRecording ? 'LIVE' : 'IDLE'}</span>
                <button onClick={() => { setSessionActive(false); setHistory([]); if(audioContextRef.current) audioContextRef.current.close(); audioContextRef.current = null; }} className="text-[10px] font-bold uppercase tracking-widest hover:text-rose-500">TERMINATE SESSION</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
