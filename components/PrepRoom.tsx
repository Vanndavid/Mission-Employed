
import React, { useState, useEffect, useRef } from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt } from '../services/geminiService';

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
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning, timeLeft]);

  // Sync timeLeft when duration changes and timer is not running or at its start
  const handleDurationChange = (val: string) => {
    const mins = parseInt(val) || 0;
    setDurationMinutes(mins);
    if (!timerRunning) {
      setTimeLeft(mins * 60);
    }
  };

  const handleFetchPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const p = await generateBehavioralPrompt(activeTheme.label);
      setCurrentPrompt(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const toggleTimer = () => {
    if (timerRunning) {
      setTimerRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (timeLeft <= 0) setTimeLeft(durationMinutes * 60);
      setTimerRunning(true);
    }
  };

  const resetTimer = () => {
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(durationMinutes * 60);
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
              onClick={() => { setActiveThemeId(theme.id); setCurrentPrompt(''); }}
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
                  disabled={loadingPrompt}
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
                  Click generate to get a specific behavioral question based on {activeTheme.label}.
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
                  disabled={timerRunning}
                  className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none disabled:opacity-50"
                />
                <span className="text-xs font-bold text-slate-400 uppercase">min</span>
              </div>

              <p className="text-slate-500 dark:text-slate-400 text-xs max-w-xs mb-6">
                Execution Rule: You MUST answer out loud. Do not stop until the timer ends or you finish the narrative.
              </p>
              
              <div className="flex space-x-2">
                <button 
                  onClick={toggleTimer}
                  className={`px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${
                    timerRunning 
                      ? 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {timerRunning ? 'Stop Timer' : (timeLeft === (durationMinutes * 60) ? 'Start Simulation' : 'Resume')}
                </button>
                {(timeLeft !== (durationMinutes * 60)) && (
                  <button 
                    onClick={resetTimer}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-6 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 transition-all text-slate-700 dark:text-slate-200 shadow-sm"
                  >
                    Reset
                  </button>
                )}
              </div>
          </div>
        </div>
      </section>
    </div>
  );
};
