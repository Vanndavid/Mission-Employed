
import React, { useState, useRef } from 'react';
import { JobApplication } from '../types';
import {
  generateCoverLetter,
  createCoverLetterSession,
  sendCoverLetterChat,
} from '../services/apiClient';

interface CoverLetterStudioProps {
  app: JobApplication;
  baseCV: string;
  coverLetterTemplate: string;
  portfolioUrl: string;
  onSave: (coverLetter: string) => void;
  onClose: () => void;
}

export const CoverLetterStudio = ({
  app,
  baseCV,
  coverLetterTemplate,
  portfolioUrl,
  onSave,
  onClose,
}: CoverLetterStudioProps) => {
  const [letter, setLetter] = useState(app.coverLetter || '');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const text = await generateCoverLetter({
        company: app.company,
        role: app.role,
        jobDescription: app.jobDescription || app.notes,
        cv: baseCV,
        template: coverLetterTemplate,
        portfolioUrl,
      });
      setLetter(text);
      const { sessionId } = await createCoverLetterSession(
        app.company,
        app.role,
        app.jobDescription || app.notes,
        text
      );
      sessionIdRef.current = sessionId;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!sessionIdRef.current || !chatInput.trim()) return;
    setLoading(true);
    try {
      const revised = await sendCoverLetterChat(sessionIdRef.current, chatInput);
      setLetter(revised);
      setChatInput('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-black">Cover Letter Studio</h3>
            <p className="text-sm text-slate-500">{app.company} — {app.role}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Tailored Cover Letter'}
          </button>

          <textarea
            value={letter}
            onChange={e => setLetter(e.target.value)}
            className="w-full h-64 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm resize-none"
            placeholder="Cover letter will appear here..."
          />

          {letter && (
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="e.g. Make it shorter, emphasize SQL experience..."
                className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <button
                onClick={handleRefine}
                disabled={loading || !chatInput.trim()}
                className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                Refine
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={() => { onSave(letter); onClose(); }}
            disabled={!letter.trim()}
            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-sm disabled:opacity-50"
          >
            Save to Application
          </button>
        </div>
      </div>
    </div>
  );
};
