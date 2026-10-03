
import React, { useState } from 'react';
import { JobApplication } from '../types';
import {
  generateCoverLetter,
  createCoverLetterSession,
  sendCoverLetterChat,
} from '../services/apiClient';
import { useDocumentStudio } from '../hooks/useDocumentStudio';
import { A4Preview, EditPreviewToggle } from './A4Preview';

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
  const [chatInput, setChatInput] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>(app.coverLetter ? 'preview' : 'edit');
  const jobDescription = app.jobDescription || app.notes;
  const studio = useDocumentStudio({
    initial: app.coverLetter || '',
    label: 'cover letter',
    generate: () =>
      generateCoverLetter({
        company: app.company,
        role: app.role,
        jobDescription,
        cv: baseCV,
        template: coverLetterTemplate,
        portfolioUrl,
      }),
    openSession: current => createCoverLetterSession(app.company, app.role, jobDescription, current),
    sendTurn: sendCoverLetterChat,
  });
  const { loading, error } = studio;
  const letter = studio.text;

  const handleGenerate = async () => {
    if (await studio.generate()) setMode('preview');
  };

  const handleRefine = async () => {
    if (!chatInput.trim()) return;
    if (await studio.refine(chatInput)) {
      setChatInput('');
      setMode('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-black">Cover Letter Studio</h3>
            <p className="text-sm text-slate-500">{app.company} — {app.role}</p>
          </div>
          <div className="flex items-center gap-3">
            <EditPreviewToggle mode={mode} onChange={setMode} />
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Tailored Cover Letter'}
          </button>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-bold">
              {error}
            </p>
          )}

          {mode === 'edit' ? (
            <textarea
              value={letter}
              onChange={e => studio.edit(e.target.value)}
              className="w-full h-64 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm resize-none"
              placeholder="Cover letter will appear here..."
            />
          ) : (
            <A4Preview
              content={letter}
              emptyLabel="Generate or paste a letter, then switch to A4 Preview."
              documentTitle={`Cover Letter — ${app.company} — ${app.role}`}
            />
          )}

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
            className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-black uppercase tracking-widest text-sm disabled:opacity-50"
          >
            Save to Application
          </button>
        </div>
      </div>
    </div>
  );
};
