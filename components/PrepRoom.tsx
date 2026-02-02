
import React, { useState, useEffect, useRef } from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt, evaluateSpeech, textToSpeech, evaluateFullMockInterview } from '../services/geminiService';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCMBlob, decodeAudioPCM, decode } from '../utils';

interface PrepRoomProps {
  answers: BehavioralAnswer[];
  onUpdateAnswer: (themeId: string, bullets: string[]) => void;
}

interface MockResult {
  theme: string;
  prompt: string;
  response: string;
}

type InputMode = 'voice' | 'text';

export const PrepRoom = ({ answers, onUpdateAnswer }: PrepRoomProps) => {
  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Mock Interview State
  const [isMockMode, setIsMockMode] = useState(false);
  const [mockIndex, setMockIndex] = useState(0);
  const [mockResults, setMockResults] = useState<MockResult[]>([]);
  const [finalMockReport, setFinalMockReport] = useState('');

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

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
  }, [timerRunning, timeLeft, isRecording]);

  const handleDurationChange = (val: string) => {
    const mins = val === '' ? 0 : parseInt(val);
    setDurationMinutes(mins);
    setTimeLeft(mins * 60);
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleFetchPrompt = async (themeOverride?: string) => {
    setLoadingPrompt(true);
    setTranscription('');
    setFeedback('');
    setSessionError(null);
    try {
      const p = await generateBehavioralPrompt(themeOverride || activeTheme.label);
      setCurrentPrompt(p);
      return p;
    } catch (e) {
      console.error(e);
      setSessionError("Failed to fetch prompt.");
    } finally {
      setLoadingPrompt(false);
    }
  };

  const playQuestion = async (text: string) => {
    setIsSpeaking(true);
    try {
      const base64Audio = await textToSpeech(text);
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioPCM(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        return new Promise((resolve) => {
          source.onended = () => {
            setIsSpeaking(false);
            ctx.close();
            resolve(true);
          };
          source.start();
        });
      }
    } catch (e) {
      console.error("TTS Error:", e);
    }
    setIsSpeaking(false);
  };

  const startRecording = async () => {
    if (!currentPrompt) return;
    setSessionError(null);
    setTranscription('');
    
    await playQuestion(currentPrompt);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtx.destination);
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
          onerror: (e) => {
            setSessionError("Transcription connection error. Try restarting.");
            stopRecording();
          },
          onclose: (e) => {
            setIsRecording(false);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        },
      });

      sessionRef.current = await sessionPromise;
      setIsRecording(true);
      setTimerRunning(true);
    } catch (err) {
      setSessionError('Microphone access failed.');
    }
  };

  const stopRecording = () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    if (scriptProcessorRef.current) { scriptProcessorRef.current.disconnect(); scriptProcessorRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(track => track.stop()); mediaStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    setIsRecording(false);
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleSubmitSimulation = async () => {
    if (!transcription.trim() || !currentPrompt) return;
    setEvaluating(true);
    setSessionError(null);
    try {
      const result = await evaluateSpeech(activeTheme.label, currentPrompt, transcription);
      setFeedback(result);
    } catch (e) {
      setSessionError("Failed to evaluate simulation.");
    } finally {
      setEvaluating(false);
    }
  };

  const startMockInterview = async () => {
    setIsMockMode(true);
    setMockIndex(0);
    setMockResults([]);
    setFinalMockReport('');
    setFeedback('');
    setTranscription('');
    setTimeLeft(durationMinutes * 60); 
    
    const theme = BEHAVIORAL_THEMES[0];
    setActiveThemeId(theme.id);
    await handleFetchPrompt(theme.label);
  };

  const nextMockQuestion = async () => {
    if (!transcription.trim()) return;
    
    const currentTheme = BEHAVIORAL_THEMES[mockIndex];
    const result: MockResult = {
      theme: currentTheme.label,
      prompt: currentPrompt,
      response: transcription
    };
    
    const newResults = [...mockResults, result];
    setMockResults(newResults);
    
    if (mockIndex < BEHAVIORAL_THEMES.length - 1) {
      const nextIdx = mockIndex + 1;
      setMockIndex(nextIdx);
      const nextTheme = BEHAVIORAL_THEMES[nextIdx];
      setActiveThemeId(nextTheme.id);
      setTranscription('');
      await handleFetchPrompt(nextTheme.label);
    } else {
      setEvaluating(true);
      try {
        const report = await evaluateFullMockInterview(newResults);
        setFinalMockReport(report);
      } catch (e) {
        setSessionError("Failed to generate final report.");
      } finally {
        setEvaluating(false);
        setIsMockMode(false);
      }
    }
  };

  const resetTimer = () => {
    if (isRecording) stopRecording();
    setTimerRunning(false);
    setTimeLeft(durationMinutes * 60);
    setTranscription('');
    setFeedback('');
    setSessionError(null);
    setIsMockMode(false);
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

  const addBullet = () => onUpdateAnswer(activeThemeId, [...activeAnswer.bullets, '']);
  const removeBullet = (index: number) => {
    if (activeAnswer.bullets.length === 1) return;
    onUpdateAnswer(activeThemeId, activeAnswer.bullets.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Training Room</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Where raw facts become fluid storytelling performance.</p>
        </div>
        {!isMockMode && !finalMockReport && (
          <button 
            onClick={startMockInterview}
            className="bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 px-6 py-3 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
          >
            🏁 Start Full Mock Interview
          </button>
        )}
      </header>

      {/* Mock Interview Progress HUD */}
      {isMockMode && (
        <div className="bg-emerald-600 p-4 rounded-2xl text-white shadow-xl animate-in slide-in-from-top duration-300">
           <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                 <span className="text-2xl">🔥</span>
                 <div>
                    <h4 className="font-black uppercase tracking-tighter text-lg leading-none">Gauntlet Mode Active</h4>
                    <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest mt-1">Status: High Intensity Simulation</p>
                 </div>
              </div>
              <div className="flex items-end flex-col">
                 <span className="font-black text-2xl">{mockIndex + 1}/{BEHAVIORAL_THEMES.length}</span>
                 <div className="w-32 h-1 bg-emerald-500/50 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-white transition-all duration-500" style={{ width: `${((mockIndex + 1) / BEHAVIORAL_THEMES.length) * 100}%` }} />
                 </div>
              </div>
           </div>
        </div>
      )}

      {finalMockReport && (
        <section className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-8 animate-in zoom-in duration-500 border-4 border-emerald-500/30">
           <div className="flex justify-between items-start border-b border-slate-800 pb-6">
              <div>
                <h3 className="text-4xl font-black uppercase italic tracking-tighter text-emerald-400">Post-Mission Review</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-2">Full Behavioral Sequence Assessment</p>
              </div>
              <button 
                onClick={() => setFinalMockReport('')}
                className="text-slate-500 hover:text-white transition-colors uppercase font-bold text-[10px] tracking-widest"
              >
                [Dismiss Report]
              </button>
           </div>
           <div className="text-lg leading-relaxed whitespace-pre-wrap font-sans prose prose-invert max-w-none">
              {finalMockReport}
           </div>
           <div className="pt-8 border-t border-slate-800 flex justify-center">
              <button 
                onClick={startMockInterview}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-12 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/10"
              >
                Execute Again
              </button>
           </div>
        </section>
      )}

      {/* Database Section */}
      {!isMockMode && !finalMockReport && (
        <section className="space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">1</div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Behavioral Protocol (Database)</h3>
          </div>
          
          <div className="flex space-x-2 overflow-x-auto pb-4 no-scrollbar">
            {BEHAVIORAL_THEMES.map(theme => (
              <button 
                key={theme.id}
                onClick={() => { setActiveThemeId(theme.id); setCurrentPrompt(''); setTranscription(''); setFeedback(''); setSessionError(null); }}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
                  activeThemeId === theme.id 
                    ? 'bg-emerald-600 dark:bg-emerald-50 text-white border-emerald-600 dark:border-emerald-500 shadow-md shadow-emerald-500/20' 
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
                      placeholder="Enter a specific detail..."
                      value={bullet}
                      onChange={(e) => updateBullet(idx, e.target.value)}
                    />
                    <button onClick={() => removeBullet(idx)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 px-2">✕</button>
                  </div>
                ))}
                <button onClick={addBullet} className="text-xs font-bold text-emerald-600 dark:text-emerald-500 hover:text-emerald-500 dark:hover:text-emerald-400 ml-5">+ Add Fact</button>
            </div>
          </div>
        </section>
      )}

      {/* Drill Section */}
      {!finalMockReport && (
        <section className="space-y-6 pb-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">2</div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                {isMockMode ? 'Current Gauntlet Challenge' : 'Simulation Protocol (Drill)'}
              </h3>
            </div>
            {!isMockMode && (
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center">
                 <button 
                  onClick={() => { setInputMode('voice'); setTranscription(''); }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'voice' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
                 >
                   🎤 Voice
                 </button>
                 <button 
                  onClick={() => { setInputMode('text'); setTranscription(''); stopRecording(); }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'text' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
                 >
                   ⌨️ Text
                 </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/10 p-6 rounded-2xl h-full flex flex-col justify-center">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    Interviewer Question: {activeTheme.label}
                  </span>
                  {!isMockMode && (
                    <button onClick={() => handleFetchPrompt()} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded text-xs font-bold transition-all shadow-sm" disabled={loadingPrompt || isRecording || isSpeaking}>
                      {loadingPrompt ? 'Loading...' : 'Generate Challenge'}
                    </button>
                  )}
                </div>
                
                {currentPrompt ? (
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-emerald-500/20 shadow-inner relative overflow-hidden">
                    {isSpeaking && <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />}
                    <p className="text-lg font-medium text-slate-700 dark:text-slate-200 italic text-center relative z-10">"{currentPrompt.trim()}"</p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-600 italic text-sm">Waiting for initialization...</div>
                )}

                {sessionError && <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-bold text-center">⚠️ {sessionError}</div>}

                <div className="mt-6 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {inputMode === 'voice' ? 'Live Transcription' : 'Draft Your Response'}
                    </p>
                    {inputMode === 'text' && (
                      <span className="text-[10px] text-slate-400 font-mono italic">Characters: {transcription.length}</span>
                    )}
                  </div>
                  
                  {inputMode === 'voice' ? (
                    <div className="p-4 bg-white/50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-700 dark:text-slate-300 min-h-[160px] max-h-[240px] overflow-y-auto whitespace-pre-wrap italic">
                      {transcription}
                      {isRecording && <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />}
                    </div>
                  ) : (
                    <textarea 
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="Start typing your response using the STAR method (Situation, Task, Action, Result)..."
                      className="w-full h-40 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none font-sans"
                    />
                  )}

                  {!isRecording && transcription.trim().length > 10 && !isMockMode && !feedback && (
                    <button onClick={handleSubmitSimulation} disabled={evaluating} className="w-full mt-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-500 transition-all">
                      {evaluating ? 'Analyzing...' : 'Submit for Performance Review'}
                    </button>
                  )}
                  {!isRecording && transcription.trim().length > 10 && isMockMode && (
                     <button onClick={nextMockQuestion} disabled={evaluating} className="w-full mt-4 py-3 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl">
                       {evaluating ? 'Processing...' : mockIndex === BEHAVIORAL_THEMES.length - 1 ? 'Finish & Final Review' : 'Next Mock Question →'}
                     </button>
                  )}
                </div>

                {feedback && (
                  <div className="mt-6 p-6 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">⚖️ Performance Analysis</h5>
                    <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{feedback}</div>
                    <button onClick={() => { setFeedback(''); setTranscription(''); }} className="mt-6 w-full py-2 text-[10px] font-bold text-slate-400 uppercase border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">Reset Protocol</button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 border-dashed flex flex-col items-center justify-center text-center">
                {!isMockMode && (
                  <div className="mb-6 w-full max-w-[140px]">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Protocol Length</label>
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                      <input 
                        type="number"
                        min="1"
                        max="60"
                        value={durationMinutes || ''}
                        onChange={(e) => handleDurationChange(e.target.value)}
                        disabled={isRecording || timerRunning}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-black text-center focus:outline-none text-slate-800 dark:text-slate-200"
                      />
                      <span className="text-[10px] font-black text-slate-400 ml-1">MIN</span>
                    </div>
                  </div>
                )}
                
                <div className={`w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex flex-col items-center justify-center mb-4 shadow-sm border ${timerRunning ? 'border-emerald-500 animate-pulse' : 'border-slate-200 dark:border-slate-700'}`}>
                    <span className="text-2xl font-bold font-mono">{formatTime(timeLeft)}</span>
                </div>
                
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mb-6 italic">
                  {inputMode === 'voice' 
                    ? '"Execution Rule: You MUST answer out loud. The recruiter is listening."'
                    : '"Execution Rule: Draft your narrative clearly. STAR structure is mandatory."'
                  }
                </p>
                
                <div className="flex flex-col space-y-2 w-full max-w-[240px]">
                  {inputMode === 'voice' ? (
                    <>
                      {!isRecording ? (
                        <button onClick={startRecording} disabled={!currentPrompt || isSpeaking} className={`px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${!currentPrompt || isSpeaking ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                          {isSpeaking ? 'Interviewer Speaking...' : 'Record Answer'}
                        </button>
                      ) : (
                        <button onClick={stopRecording} className="px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm bg-rose-600 text-white hover:bg-rose-500">Stop Recording</button>
                      )}
                    </>
                  ) : (
                    <button 
                      onClick={() => setTimerRunning(!timerRunning)} 
                      disabled={!currentPrompt}
                      className={`px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${!currentPrompt ? 'bg-slate-200 text-slate-400' : timerRunning ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}
                    >
                      {timerRunning ? 'Pause Mission' : 'Start Focus Timer'}
                    </button>
                  )}
                  <button onClick={resetTimer} className="bg-white dark:bg-slate-800 hover:bg-slate-50 px-6 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 transition-all text-slate-700 dark:text-slate-200">Reset Session</button>
                </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
