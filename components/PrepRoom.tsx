
import React, { useState, useEffect, useRef } from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt, evaluateSpeech } from '../services/geminiService';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCMBlob } from '../utils';

interface PrepRoomProps {
  answers: BehavioralAnswer[];
  onUpdateAnswer: (themeId: string, bullets: string[]) => void;
}

export const PrepRoom = ({ answers, onUpdateAnswer }: PrepRoomProps) => {
  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  
  // Timer State
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [timeLeft, setTimeLeft] = useState(600); // in seconds
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Recording & Transcription State
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const activeTheme = BEHAVIORAL_THEMES.find(t => t.id === activeThemeId)!;
  const activeAnswer = answers.find(a => a.themeId === activeThemeId) || { themeId: activeThemeId, bullets: [''] };

  useEffect(() => {
    if (timerRunning && timeLeft > 0) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setTimerRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (isRecording) stopRecording();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning, timeLeft]);

  const handleDurationChange = (val: string) => {
    const mins = parseInt(val) || 0;
    setDurationMinutes(mins);
    if (!timerRunning) {
      setTimeLeft(mins * 60);
    }
  };

  const handleFetchPrompt = async () => {
    setLoadingPrompt(true);
    setTranscription('');
    setFeedback('');
    try {
      const p = await generateBehavioralPrompt(activeTheme.label);
      setCurrentPrompt(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.debug('Gemini Live session opened');
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPCMBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setTranscription(prev => prev + text);
            }
          },
          onerror: (e) => console.error('Gemini Live error:', e),
          onclose: () => console.debug('Gemini Live session closed'),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        },
      });

      sessionRef.current = await sessionPromise;
      setIsRecording(true);
      if (!timerRunning) setTimerRunning(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Microphone access is required for the simulation protocol.');
    }
  };

  const stopRecording = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleSubmitSimulation = async () => {
    if (!transcription.trim() || !currentPrompt) return;
    setEvaluating(true);
    try {
      const result = await evaluateSpeech(activeTheme.label, currentPrompt, transcription);
      setFeedback(result);
    } catch (e) {
      console.error(e);
      setFeedback("Failed to evaluate simulation. Check your connection.");
    } finally {
      setEvaluating(false);
    }
  };

  const toggleTimer = () => {
    if (timerRunning) {
      if (isRecording) stopRecording();
      else setTimerRunning(false);
    } else {
      if (timeLeft <= 0) setTimeLeft(durationMinutes * 60);
      setTimerRunning(true);
    }
  };

  const resetTimer = () => {
    if (isRecording) stopRecording();
    setTimerRunning(false);
    setTimeLeft(durationMinutes * 60);
    setTranscription('');
    setFeedback('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateBullet = (index: number, val: string) => {
    const newBullets = [...activeAnswer.bullets];
    newBullets[index] = val;
    onUpdateAnswer(activeThemeId, newBullets);
  };

  const addBullet = () => {
    onUpdateAnswer(activeThemeId, [...activeAnswer.bullets, '']);
  };

  const removeBullet = (index: number) => {
    if (activeAnswer.bullets.length === 1) return;
    const newBullets = activeAnswer.bullets.filter((_, i) => i !== index);
    onUpdateAnswer(activeThemeId, newBullets);
  };

  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Training Room</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Where raw facts become fluid storytelling performance.</p>
      </header>

      {/* Section 1: Behavioral Protocol */}
      <section className="space-y-6">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">1</div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Behavioral Protocol (Database)</h3>
        </div>
        
        <div className="flex space-x-2 overflow-x-auto pb-4 no-scrollbar">
          {BEHAVIORAL_THEMES.map(theme => (
            <button 
              key={theme.id}
              onClick={() => { setActiveThemeId(theme.id); setCurrentPrompt(''); setTranscription(''); setFeedback(''); }}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
                activeThemeId === theme.id 
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white border-emerald-600 dark:border-emerald-500 shadow-md shadow-emerald-500/20' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm max-w-4xl">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeTheme.label} Archive</h3>
              <p className="text-xs text-slate-400 uppercase font-bold italic tracking-tight">Raw facts only. No fluff.</p>
           </div>

           <div className="space-y-4">
              {activeAnswer.bullets.map((bullet, idx) => (
                <div key={idx} className="flex space-x-2">
                  <div className="pt-3 text-emerald-500">•</div>
                  <input 
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Enter a specific detail (e.g., 'Reduced latency by 40% using Redis')"
                    value={bullet}
                    onChange={(e) => updateBullet(idx, e.target.value)}
                  />
                  <button 
                    onClick={() => removeBullet(idx)}
                    className="text-slate-300 dark:text-slate-600 hover:text-rose-500 px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button 
                onClick={addBullet}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-500 hover:text-emerald-500 dark:hover:text-emerald-400 ml-5"
              >
                + Add Fact
              </button>
           </div>
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />

      {/* Section 2: Simulation Protocol */}
      <section className="space-y-6 pb-20">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">2</div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Simulation Protocol (Performance)</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/10 p-6 rounded-2xl h-full flex flex-col justify-center">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Random Prompt Generator</span>
                <button 
                  onClick={handleFetchPrompt}
                  className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded text-xs font-bold transition-all shadow-sm"
                  disabled={loadingPrompt || isRecording}
                >
                  {loadingPrompt ? 'Loading...' : 'Generate Challenge'}
                </button>
              </div>
              
              {currentPrompt ? (
                <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-emerald-500/20 shadow-inner">
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-200 italic text-center">
                    "{currentPrompt.trim()}"
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 dark:text-slate-600 italic text-sm">
                  Click generate to get a challenge based on your chosen theme.
                </div>
              )}

              {transcription && (
                <div className="mt-6 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Transcription</p>
                  <div className="p-4 bg-white/50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-700 dark:text-slate-300 min-h-[100px] max-h-[200px] overflow-y-auto whitespace-pre-wrap italic">
                    {transcription}
                    {isRecording && <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />}
                  </div>
                  {!isRecording && transcription && !feedback && (
                    <button
                      onClick={handleSubmitSimulation}
                      disabled={evaluating}
                      className="w-full mt-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/10"
                    >
                      {evaluating ? 'Analyzing Performance...' : 'Submit for Performance Review'}
                    </button>
                  )}
                </div>
              )}

              {feedback && (
                <div className="mt-6 p-6 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-500 shadow-xl overflow-hidden">
                  <div className="flex items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="text-xl mr-2">⚖️</span>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider">Unbiased Performance Analysis</h5>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                    {feedback}
                  </div>
                  <button 
                    onClick={() => { setFeedback(''); setTranscription(''); }} 
                    className="mt-6 w-full py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter hover:text-emerald-500 transition-colors border border-dashed border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    Reset Protocol for New Drill
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 border-dashed flex flex-col items-center justify-center text-center">
              <div className={`w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex flex-col items-center justify-center mb-4 shadow-sm border ${timerRunning ? 'border-emerald-500 animate-pulse' : 'border-slate-200 dark:border-slate-700'}`}>
                  <span className={`text-2xl font-bold font-mono ${timeLeft < 60 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Remaining</span>
              </div>
              
              <div className="mb-4 flex items-center space-x-2">
                <label htmlFor="duration" className="text-xs font-bold text-slate-400 uppercase">Set Timer:</label>
                <input 
                  id="duration"
                  type="number" 
                  min="1"
                  max="60"
                  value={durationMinutes}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  disabled={timerRunning || isRecording}
                  className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none disabled:opacity-50"
                />
                <span className="text-xs font-bold text-slate-400 uppercase">min</span>
              </div>

              <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mb-6">
                Execution Rule: You MUST answer out loud. Click "Start Recording" to begin the simulation and transcription.
              </p>
              
              <div className="flex flex-col space-y-2 w-full max-w-[240px]">
                {!isRecording ? (
                  <button 
                    onClick={startRecording}
                    disabled={!currentPrompt}
                    className={`px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${
                      !currentPrompt 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button 
                    onClick={stopRecording}
                    className="px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm bg-rose-600 text-white hover:bg-rose-500"
                  >
                    Done (Stop Recording)
                  </button>
                )}
                
                {(timeLeft !== (durationMinutes * 60) || transcription) && (
                  <button 
                    onClick={resetTimer}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-6 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 transition-all text-slate-700 dark:text-slate-200 shadow-sm"
                  >
                    Reset Protocol
                  </button>
                )}
              </div>
              
              {isRecording && (
                <div className="mt-4 flex items-center space-x-2 text-rose-500">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Recording Active</span>
                </div>
              )}
          </div>
        </div>
      </section>
    </div>
  );
};
