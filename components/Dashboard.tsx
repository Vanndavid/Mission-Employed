
import React, { useState, useMemo } from 'react';
import { DailyLog } from '../types';
import { getRecentWeekdays } from '../utils/dateUtils';
import { generateCodingProblem } from '../services/geminiService';

interface DashboardProps {
  logs: Record<string, DailyLog>;
  onToggleTask: (date: string, task: keyof DailyLog) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ logs, onToggleTask }) => {
  const today = new Date().toISOString().split('T')[0];
  const currentLog = logs[today] || { date: today, codingEasy: false, codingMedium: false, behavioral: false, simulation: false };

  const [aiProblem, setAiProblem] = useState<{ title: string, description: string, examples: string[] } | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);

  const fetchProblem = async (diff: 'easy' | 'medium') => {
    setLoadingProblem(true);
    try {
      const p = await generateCodingProblem(diff);
      setAiProblem(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProblem(false);
    }
  };

  const historyDates = useMemo(() => getRecentWeekdays(28).reverse(), [logs]);
  
  const streakData = useMemo(() => {
    let currentStreak = 0;
    const sortedWeekdays = getRecentWeekdays(100); 
    
    for (const date of sortedWeekdays) {
      const log = logs[date];
      const isComplete = log && log.codingEasy && log.codingMedium && log.behavioral && log.simulation;
      
      if (isComplete) {
        currentStreak++;
      } else {
        if (date !== today) break;
      }
    }
    return currentStreak;
  }, [logs, today]);

  const taskStats = [
    { id: 'codingEasy', label: '1 Easy Problem', time: '60-90m (Combined)' },
    { id: 'codingMedium', label: '1 Medium Problem', time: '60-90m (Combined)' },
    { id: 'behavioral', label: 'Behavioral Prep', time: '20-30m' },
    { id: 'simulation', label: 'Interview Sim', time: '10m' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">Daily Requirements</h2>
        <p className="text-slate-400 mt-2">Zero judgment. Just execution. Weekday protocol.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {taskStats.map((task) => (
          <div 
            key={task.id}
            onClick={() => onToggleTask(today, task.id as keyof DailyLog)}
            className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
              currentLog[task.id as keyof DailyLog] 
                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5' 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${currentLog[task.id as keyof DailyLog] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                {currentLog[task.id as keyof DailyLog] && <span className="text-white text-xs">✓</span>}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{task.time}</span>
            </div>
            <h3 className="font-bold text-lg">{task.label}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Training Prompt
              </h3>
              <div className="space-x-2">
                <button 
                  onClick={() => fetchProblem('easy')}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  Get Easy
                </button>
                <button 
                  onClick={() => fetchProblem('medium')}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  Get Medium
                </button>
              </div>
            </div>
            
            {loadingProblem ? (
              <div className="h-48 flex items-center justify-center text-slate-500 animate-pulse">
                Engaging Intelligence Core...
              </div>
            ) : aiProblem ? (
              <div className="space-y-4">
                <h4 className="text-lg font-bold text-emerald-400 underline decoration-emerald-500/30 underline-offset-4">{aiProblem.title}</h4>
                <div className="p-4 bg-slate-900 rounded-lg mono text-sm leading-relaxed text-slate-300">
                  {aiProblem.description}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase">Examples:</p>
                  {aiProblem.examples.map((ex, i) => (
                    <div key={i} className="text-xs bg-slate-900 p-2 rounded border border-slate-800 mono text-emerald-300/70">{ex}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic">
                Fetch a problem to begin your daily practice session.
              </div>
            )}
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <span className="mr-2">📅</span> Protocol History (Last 28 Weekdays)
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-2">
              {historyDates.map(date => {
                const log = logs[date];
                const isComplete = log && log.codingEasy && log.codingMedium && log.behavioral && log.simulation;
                const d = new Date(date);
                const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                const dateLabel = d.getDate();
                
                return (
                  <div key={date} className="group relative">
                    <div className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-all ${
                      isComplete ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-900/50 border-slate-800'
                    }`}>
                      <div className="grid grid-cols-2 gap-1 p-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.codingEasy ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.codingMedium ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.behavioral ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.simulation ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                      </div>
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {dayLabel} {dateLabel}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-center space-x-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></div> Completed</div>
              <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-slate-700 mr-2"></div> Pending</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <span className="mr-2">🔥</span> Current Streak
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-48">
                 <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                    <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                    <circle 
                      cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="12" fill="transparent" 
                      strokeDasharray="565.48" 
                      strokeDashoffset={565.48 - (Math.min(streakData, 30) / 30) * 565.48}
                      className="text-emerald-500 transition-all duration-1000 ease-out" 
                      strokeLinecap="round"
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-slate-100 tracking-tighter">{streakData}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em] mt-1">Weekdays</span>
                 </div>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-400 text-center italic">"The only way out is through the protocol."</p>
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-slate-500 font-bold uppercase tracking-widest">Next Milestone</span>
                  <span className="text-emerald-400 font-bold">{Math.max(5, Math.ceil((streakData + 1) / 5) * 5)} Days</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
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
