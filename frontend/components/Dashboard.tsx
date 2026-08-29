
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CodingHistoryEntry, JobApplication } from '../types';
import { getLocalDateString } from '../utils';
import { computeWeakTopics, inferTopicsFromTitle } from '../utils/codingTopics';
import { generateCodingProblem, sendCodingChat, createCodingSession } from '../services/apiClient';
import { UpcomingInterviews } from './UpcomingInterviews';
import { useAuth } from '../contexts/AuthContext';
import { PremiumGate } from './PremiumGate';

interface Message {
  role: 'tutor' | 'student';
  text: string;
}

interface DashboardProps {
  applications: JobApplication[];
  codingHistory: CodingHistoryEntry[];
  onCodingComplete: (entry: CodingHistoryEntry) => void;
}

export const Dashboard = ({
  applications,
  codingHistory,
  onCodingComplete,
}: DashboardProps) => {
  const navigate = useNavigate();
  const { isPremium } = useAuth();
  const today = getLocalDateString();

  const [aiProblem, setAiProblem] = useState<{ title: string; description: string; examples: string[]; topics?: string[] } | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [currentDifficulty, setCurrentDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [userMessage, setUserMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weakTopics = useMemo(() => computeWeakTopics(codingHistory).slice(0, 5), [codingHistory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, isTutorThinking]);

  const fetchProblem = async (diff: 'easy' | 'medium' | 'hard') => {
    setLoadingProblem(true);
    setFetchError(null);
    setChatHistory([]);
    setUserMessage('');
    setCurrentDifficulty(diff);
    try {
      const p = await generateCodingProblem(diff);
      setAiProblem(p);
      const { sessionId } = await createCodingSession(p.title, p.description);
      sessionIdRef.current = sessionId;
      setChatHistory([
        {
          role: 'tutor',
          text: `Hello. I'm your interviewer for today. Let's look at "${p.title}". How would you approach this? Feel free to share your thoughts or initial code.`,
        },
      ]);
    } catch (e) {
      console.error(e);
      setFetchError('Could not reach AI server. Start the backend with `npm run server` and check your API key.');
    } finally {
      setLoadingProblem(false);
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || userMessage;
    if (!sessionIdRef.current || !textToSend.trim()) return;

    setChatHistory(prev => [...prev, { role: 'student', text: textToSend }]);
    setUserMessage('');
    setIsTutorThinking(true);

    try {
      const tutorText = await sendCodingChat(sessionIdRef.current, textToSend);
      setChatHistory(prev => [...prev, { role: 'tutor', text: tutorText }]);

      if (/mission accomplished/i.test(tutorText) && aiProblem) {
        const topics = aiProblem.topics?.length ? aiProblem.topics : inferTopicsFromTitle(aiProblem.title);
        onCodingComplete({
          date: today,
          difficulty: currentDifficulty,
          title: aiProblem.title,
          completed: true,
          topics,
        });
      }
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [
        ...prev,
        { role: 'tutor', text: 'ERROR: Connection to the intelligence core was interrupted. Please check your API key.' },
      ]);
    } finally {
      setIsTutorThinking(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Mission Control</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Software engineering coding practice with an AI tutor.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-[700px]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Coding Tutor
              </h3>
              {isPremium && (
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
                  className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  New Medium
                </button>
                <button
                  onClick={() => fetchProblem('hard')}
                  className="px-3 py-1 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  New Hard
                </button>
              </div>
              )}
            </div>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate title="AI coding tutor (Premium)" />
              </div>
            ) : (
              <>
                {fetchError && (
                  <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-600 dark:text-rose-400 font-bold">
                    {fetchError}
                  </div>
                )}
                {loadingProblem ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                    Establishing Mentor Connection...
                  </div>
                ) : aiProblem ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
                      <h4 className="font-bold text-brand-600 dark:text-brand-400 mb-1">{aiProblem.title}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{aiProblem.description}</p>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 no-scrollbar">
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'tutor' ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                              msg.role === 'tutor'
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                                : 'bg-brand-600 text-white rounded-tr-none shadow-md'
                            }`}
                          >
                            <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                          </div>
                        </div>
                      ))}
                      {isTutorThinking && (
                        <div className="flex justify-start">
                          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none flex space-x-1 items-center">
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 shrink-0">
                      <textarea
                        className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:outline-none focus:border-brand-500 transition-colors text-sm font-mono text-slate-800 dark:text-slate-200 resize-none"
                        placeholder="Type your code or ask a question..."
                        value={userMessage}
                        onChange={e => setUserMessage(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.metaKey) handleSendMessage();
                        }}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSendMessage('Can you give me a small hint to move forward?')}
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
                              : 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-600/10'
                          }`}
                        >
                          Send Message
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm italic space-y-4">
                    <div className="text-6xl grayscale opacity-20">👨‍🏫</div>
                    <p>The Tutoring Lab is ready. Initialize a mission to begin.</p>
                    <button
                      onClick={() => fetchProblem('easy')}
                      className="bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 dark:text-brand-400 px-6 py-2 rounded-full font-bold transition-all"
                    >
                      Start New Session
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <UpcomingInterviews applications={applications} onSelectApp={id => navigate(`/applications?prep=${id}`)} />

          {weakTopics.length > 0 && (
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-amber-300 dark:border-amber-500/30 shadow-sm">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <span className="mr-2">⚠️</span> Weak Topics
              </h3>
              <div className="space-y-2">
                {weakTopics.map(w => (
                  <div key={w.topic} className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{w.topic}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">
                      {w.completionRate}% ({w.completed}/{w.attempted})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {codingHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <span className="mr-2">📚</span> Coding History
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {codingHistory.slice(0, 10).map((entry, i) => (
                  <div key={i} className="flex justify-between items-start text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{entry.title}</p>
                      <p className="text-[10px] text-slate-400 uppercase">{entry.difficulty} · {entry.topics.join(', ') || 'General'}</p>
                    </div>
                    <span className={`text-xs font-bold ${entry.completed ? 'text-brand-600' : 'text-slate-400'}`}>
                      {entry.completed ? '✓' : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
