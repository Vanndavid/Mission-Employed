
import React, { useState, useMemo } from 'react';
import { DailyLog } from '../types';
import { getRecentWeekdays, calculateStreak } from '../utils';
import { generateCodingProblem, evaluateSolution } from '../services/geminiService';
import { DAILY_TASKS } from '../constants';

interface DashboardProps {
  logs: Record<string, DailyLog>;
  onToggleTask: (date: string, taskId: string) => void;
}

export const Dashboard = ({ logs, onToggleTask }: DashboardProps) => {
  const today = new Date().toISOString().split('T')[0];
  const currentLog = logs[today] || { date: today, completions: {} };

  const [aiProblem, setAiProblem] = useState<{ title: string, description: string, examples: string[] } | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [userSolution, setUserSolution] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evaluating, setEvaluating] = useState(false);

  const fetchProblem = async (diff: 'easy' | 'medium') => {
    setLoadingProblem(true);
    setFeedback('');
    setUserSolution('');
    try {
      const p = await generateCodingProblem(diff);
      setAiProblem(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProblem(false);
    }
  };

  const handleSubmitSolution = async () => {
    if (!aiProblem || !userSolution.trim()) return;
    setEvaluating(true);
    try {
      const result = await evaluateSolution(aiProblem.title, aiProblem.description, userSolution);
      setFeedback(result);
    } catch (e) {
      console.error(e);
      setFeedback("Failed to evaluate. Ensure your API key is valid.");
    } finally {
      setEvaluating(false);
    }
  };

  const historyDates = useMemo(() => getRecentWeekdays(28).reverse(), []);
  const streakData = useMemo(() => calculateStreak(logs), [logs, today]);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Zero judgment. Just execution. Weekday protocol.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {DAILY_TASKS.map((task) => {
          const isDone = !!currentLog.completions[task.id];
          return (
            <div 
              key={task.id}
              onClick={() => onToggleTask(today, task.id)}
              className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                isDone 
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5' 
                  : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {isDone && <span className="text-white text-xs">✓</span>}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">{task.time}</span>
              </div>
              <h3 className="font-bold text-lg">{task.label}</h3>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Coding Protocol
              </h3>
              <div className="space-x-2">
                <button 
                  onClick={() => fetchProblem('easy')}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-bold transition-colors text-slate-700 dark:text-slate-200"
                  disabled={loadingProblem}
                >
                  Get Easy
                </button>
                <button 
                  onClick={() => fetchProblem('medium')}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  Get Medium
                </button>
              </div>
            </div>
            
            {loadingProblem ? (
              <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                Engaging Intelligence Core...
              </div>
            ) : aiProblem ? (
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/30 underline-offset-4">{aiProblem.title}</h4>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800 mt-2">
                    {aiProblem.description}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Examples:</p>
                  {aiProblem.examples.map((ex, i) => (
                    <div key={i} className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800 mono text-emerald-700 dark:text-emerald-300/70">{ex}</div>
                  ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Your Solution / Strategy:</p>
                  </div>
                  <textarea
                    className="w-full h-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm font-mono text-slate-800 dark:text-slate-200"
                    placeholder="Describe your approach or write code here..."
                    value={userSolution}
                    onChange={(e) => setUserSolution(e.target.value)}
                  />
                  <button
                    onClick={handleSubmitSolution}
                    disabled={evaluating || !userSolution.trim()}
                    className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center ${
                      evaluating || !userSolution.trim()
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/10'
                    }`}
                  >
                    {evaluating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Evaluating...
                      </>
                    ) : 'Submit for Feedback'}
                  </button>
                </div>

                {feedback && (
                  <div className="mt-4 p-5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center mb-2">
                      <span className="text-xl mr-2">🤖</span>
                      <h5 className="font-bold text-blue-800 dark:text-blue-300 text-sm uppercase tracking-wider">Interviewer Feedback</h5>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-blue-100/80 leading-relaxed italic">
                      {feedback}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm italic">
                Fetch a problem to begin your daily practice session.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <span className="mr-2">📅</span> Protocol History (Last 28 Weekdays)
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-2">
              {historyDates.map(date => {
                const log = logs[date];
                const isComplete = log && DAILY_TASKS.every(task => log.completions[task.id]);
                const d = new Date(date);
                const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                const dateLabel = d.getDate();
                
                return (
                  <div key={date} className="group relative">
                    <div className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-all ${
                      isComplete 
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40' 
                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'
                    }`}>
                      <div className="grid grid-cols-2 gap-1 p-1">
                        {DAILY_TASKS.slice(0, 4).map(task => (
                           <div key={task.id} className={`w-1.5 h-1.5 rounded-full ${log?.completions[task.id] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-[10px] text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {dayLabel} {dateLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 h-full flex flex-col shadow-sm">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <span className="mr-2">🔥</span> Current Streak
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-48">
                 <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="90" 
                      stroke="currentColor" 
                      strokeWidth="12" 
                      fill="transparent" 
                      className="text-slate-100 dark:text-slate-800" 
                    />
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="90" 
                      stroke="currentColor" 
                      strokeWidth="12" 
                      fill="transparent" 
                      strokeDasharray="565.48" 
                      strokeDashoffset={565.48 - (Math.min(streakData, 30) / 30) * 565.48}
                      className="text-emerald-500 transition-all duration-1000 ease-out" 
                      strokeLinecap="round"
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter">{streakData}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-[0.2em] mt-1">Weekdays</span>
                 </div>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center italic">"The only way out is through the protocol."</p>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Next Milestone</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{Math.max(5, Math.ceil((streakData + 1) / 5) * 5)} Days</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${(streakData % 5) * 20 || (streakData > 0 ? 100 : 0)}%` }}
                  ></div>
                </div>
              </div>
            </div>
           </div>
        </div>
      </div>
    </div>
  );
};
