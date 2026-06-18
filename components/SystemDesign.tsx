import React, { useState, useRef, useEffect } from 'react';
import { SYSTEM_DESIGN_TOPICS } from '../constants';
import {
  generateSystemDesignPrompt,
  createSystemDesignSession,
  sendSystemDesignChat,
  evaluateSystemDesign,
} from '../services/apiClient';

interface Message {
  role: 'mentor' | 'student';
  text: string;
}

export const SystemDesign = () => {
  const [topicId, setTopicId] = useState(SYSTEM_DESIGN_TOPICS[0].id);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const topic = SYSTEM_DESIGN_TOPICS.find(t => t.id === topicId)!;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, evaluation]);

  const startSession = async () => {
    setLoading(true);
    setMessages([]);
    setEvaluation('');
    setUserInput('');
    try {
      const scenario = await generateSystemDesignPrompt(topic.label);
      const { sessionId: sid } = await createSystemDesignSession(topic.label, scenario);
      setSessionId(sid);
      setPrompt(scenario);
      setMessages([
        { role: 'mentor', text: scenario },
        { role: 'mentor', text: 'Walk me through your high-level approach. What are the core requirements and constraints?' },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (text?: string) => {
    const msg = text ?? userInput;
    if (!sessionId || !msg.trim()) return;
    setMessages(prev => [...prev, { role: 'student', text: msg }]);
    setUserInput('');
    setLoading(true);
    try {
      const reply = await sendSystemDesignChat(sessionId, msg);
      setMessages(prev => [...prev, { role: 'mentor', text: reply }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const report = await evaluateSystemDesign(sessionId);
      setEvaluation(report);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-center gap-2">
        {SYSTEM_DESIGN_TOPICS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTopicId(t.id); setSessionId(null); setMessages([]); setEvaluation(''); }}
            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              topicId === t.id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!sessionId ? (
        <div className="text-center py-16">
          <button
            onClick={startSession}
            disabled={loading}
            className="px-12 py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
          >
            {loading ? 'Loading...' : `Start ${topic.label} Session`}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-black text-emerald-600 uppercase tracking-widest text-sm">{topic.label}</h3>
            {prompt && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prompt}</p>}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'mentor' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                  m.role === 'mentor'
                    ? 'bg-slate-100 dark:bg-slate-800 rounded-tl-none'
                    : 'bg-emerald-600 text-white rounded-tr-none'
                }`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-xs text-slate-400 animate-pulse">Mentor is thinking...</div>
            )}
          </div>

          {evaluation && (
            <div className="mx-4 mb-4 p-4 bg-slate-900 text-emerald-50 rounded-xl text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">Design Evaluation</h4>
              {evaluation}
            </div>
          )}

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <textarea
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSend(); }}
              placeholder="Describe requirements, scale, tradeoffs, failure modes..."
              className="w-full h-20 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSend()}
                disabled={loading || !userInput.trim()}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                Send
              </button>
              <button
                onClick={handleEvaluate}
                disabled={loading || messages.length < 2}
                className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                Evaluate Design
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
