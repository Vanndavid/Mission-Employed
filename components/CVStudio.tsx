
import React, { useState, useRef } from 'react';
import { JobApplication } from '../types';
import {
  generateTailoredCV,
  createCVSession,
  sendCVChat,
} from '../services/apiClient';
import { A4Preview, EditPreviewToggle } from './A4Preview';

interface CVStudioProps {
  app: JobApplication;
  baseCV: string;
  cvTemplate: string;
  portfolioUrl: string;
  onSave: (tailoredCV: string) => void;
  onClose: () => void;
}

export const CVStudio = ({
  app,
  baseCV,
  cvTemplate,
  portfolioUrl,
  onSave,
  onClose,
}: CVStudioProps) => {
  const [cv, setCv] = useState(app.tailoredCV || '');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>(app.tailoredCV ? 'preview' : 'edit');
  const sessionIdRef = useRef<string | null>(null);

  const handleGenerate = async () => {
    if (!baseCV.trim()) {
      alert('Add your base CV in CV & Profile first.');
      return;
    }
    setLoading(true);
    try {
      const text = await generateTailoredCV({
        company: app.company,
        role: app.role,
        jobDescription: app.jobDescription || app.notes,
        cv: baseCV,
        template: cvTemplate,
        portfolioUrl,
      });
      setCv(text);
      setMode('preview');
      const { sessionId } = await createCVSession(
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
      const revised = await sendCVChat(sessionIdRef.current, chatInput);
      setCv(revised);
      setChatInput('');
      setMode('preview');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-black">CV Studio</h3>
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
            disabled={loading || !baseCV.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Tailored CV'}
          </button>

          {!baseCV.trim() && (
            <p className="text-xs text-amber-600 font-bold">
              Paste your base CV in CV & Profile before generating.
            </p>
          )}

          {mode === 'edit' ? (
            <textarea
              value={cv}
              onChange={e => setCv(e.target.value)}
              className="w-full h-64 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono resize-none"
              placeholder="Tailored CV will appear here..."
            />
          ) : (
            <A4Preview
              content={cv}
              emptyLabel="Generate or paste a CV, then switch to A4 Preview."
              documentTitle={`CV — ${app.company} — ${app.role}`}
            />
          )}

          {cv && (
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="e.g. Move SQL projects higher, shorten summary..."
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
            onClick={() => { onSave(cv); onClose(); }}
            disabled={!cv.trim()}
            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-sm disabled:opacity-50"
          >
            Save to Application
          </button>
        </div>
      </div>
    </div>
  );
};
