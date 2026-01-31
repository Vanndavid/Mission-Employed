
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DailyLog } from '../types';
import { getRecentDays, calculateStreak, getLocalDateString } from '../utils';
import { generateCodingProblem, startCodingTutorSession } from '../services/geminiService';
import { DAILY_TASKS } from '../constants';

interface Message {
  role: 'tutor' | 'student';
  text: string;
}

interface DashboardProps {
  logs: Record<string, DailyLog>;
  onToggleTask: (date: string, taskId: string) => void;
}

export const Dashboard = ({ logs, onToggleTask }: DashboardProps) => {
  const today = getLocalDateString();
  const currentLog = logs[today] || { date: today, completions: {} };

  const [aiProblem, setAiProblem] = useState<{ title: string, description: string, examples: string[] } | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  
  const chatSessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isTutorThinking]);

  const fetchProblem = async (diff: 'easy' | 'medium') => {
    setLoadingProblem(true);
    setChatHistory([]);
    setUserMessage('');
    try {
      const p = await generateCodingProblem(diff);
      setAiProblem(p);
      // Initialize chat session
      chatSessionRef.current = startCodingTutorSession(p.title, p.description);
      setChatHistory([{ role: 'tutor', text: `Hello. I'm your interviewer for today. Let's look at "${p.title}". How would you approach this? Feel free to share your thoughts or initial code.` }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProblem(false);
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || userMessage;
    if (!chatSessionRef.current || !textToSend.trim()) return;

    const newStudentMsg: Message = { role: 'student', text: textToSend };
    setChatHistory(prev => [...prev, newStudentMsg]);
    setUserMessage('');
    setIsTutorThinking(true);

    try {
      const response = await chatSessionRef.current.sendMessage({ message: textToSend });
      const tutorText = response.text || "I'm having trouble connecting to the logic core. Please try again.";
      setChatHistory(prev => [...prev, { role: 'tutor', text: tutorText }]);
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'tutor', text: "ERROR: Connection to the intelligence core was interrupted. Please check your API key." }]);
    } finally {
      setIsTutorThinking(false);
    }
  };

  const requestHint = () => {
    handleSendMessage("Can you give me a small hint to move forward?");
  };

  const historyDates = useMemo(() => getRecentDays(28).reverse(), [today]);
  const streakData = useMemo(() => calculateStreak(logs), [logs]);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Zero judgment. Just execution. Everyday protocol.</p>
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
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-[700px]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Coding Tutor
              </h3>
              <div className="space-x-2">
                <button 
                  onClick={() => fetchProblem('easy')}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-bold transition-colors text-slate-700 dark:text-slate-200"
                  disabled={loadingProblem}
                >
                  New Easy
                </button>
                <button 
                  onClick={() => fetchProblem('medium')}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  New Medium
                </button>
              </div>
            </div>
            
            {loadingProblem ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                Establishing Mentor Connection...
              </div>
            ) : aiProblem ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
                  <h4 className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">{aiProblem.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{aiProblem.description}</p>
                </div>

                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 no-scrollbar"
                >
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'tutor' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'tutor' 
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none' 
                          : 'bg-emerald-600 text-white rounded-tr-none shadow-md'
                      }`}>
                        <div className="whitespace-pre-wrap font-sans">
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTutorThinking && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none flex space-x-1 items-center">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 shrink-0">
                  <textarea
                    className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-sm font-mono text-slate-800 dark:text-slate-200 resize-none"
                    placeholder="Type your code or ask a question..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) handleSendMessage();
                    }}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={requestHint}
                      disabled={isTutorThinking || !aiProblem}
                      className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-all"
                    >
                      💡 Request Hint
                    </button>
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={isTutorThinking || !userMessage.trim()}
                      className={`flex-[2] py-3 rounded-xl font-bold transition-all flex items-center justify-center ${
                        isTutorThinking || !userMessage.trim()
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/10'
                      }`}
                    >
                      Send Message
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-slate-400 font-mono uppercase tracking-tighter">Cmd + Enter to Send</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm italic space-y-4">
                <div className="text-6xl grayscale opacity-20">👨‍🏫</div>
                <p>The Tutoring Lab is ready. Initialize a mission to begin.</p>
                <button 
                  onClick={() => fetchProblem('easy')}
                  className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 px-6 py-2 rounded-full font-bold transition-all"
                >
                  Start New Session
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <span className="mr-2">📅</span> Protocol History (Last 28 Days)
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-2">
              {historyDates.map(date => {
                const log = logs[date];
                const isComplete = log && DAILY_TASKS.every(task => log.completions[task.id]);
                const parts = date.split('-');
                const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-[0.2em] mt-1">Days</span>
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
