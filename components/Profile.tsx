
import React, { useRef } from 'react';

interface ProfileProps {
  baseCV: string;
  cvFileName: string;
  baseCoverLetter: string;
  portfolioUrl: string;
  coverLetterTemplate: string;
  onUpdate: (partial: {
    baseCV?: string;
    cvFileName?: string;
    baseCoverLetter?: string;
    portfolioUrl?: string;
    coverLetterTemplate?: string;
  }) => void;
}

export const Profile = ({
  baseCV,
  cvFileName,
  baseCoverLetter,
  portfolioUrl,
  coverLetterTemplate,
  onUpdate,
}: ProfileProps) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      onUpdate({ baseCV: text.slice(0, 50000), cvFileName: file.name });
    };
    if (file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      onUpdate({ cvFileName: file.name });
      alert('For PDF/DOCX, paste CV text into the editor below. Full parsing coming in Phase 4.');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">CV & Profile</h2>
        <p className="text-slate-500 mt-2">Frozen CV. One version. Stop tweaking.</p>
      </header>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold">CV / Resume</h3>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
            <button onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs font-bold">
              Upload File
            </button>
          </div>
        </div>
        {cvFileName && <p className="text-xs text-emerald-600 font-bold">File: {cvFileName}</p>}
        <textarea
          value={baseCV}
          onChange={e => onUpdate({ baseCV: e.target.value })}
          placeholder="Paste your frozen CV here..."
          className="w-full h-64 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono resize-none"
        />
      </section>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 space-y-4">
        <h3 className="font-bold">Portfolio URL</h3>
        <input
          value={portfolioUrl}
          onChange={e => onUpdate({ portfolioUrl: e.target.value })}
          placeholder="https://github.com/you or portfolio site"
          className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
        />
      </section>

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 space-y-4">
        <h3 className="font-bold">Cover Letter Template</h3>
        <p className="text-xs text-slate-400">Base template used by Cover Letter Studio when generating per-application letters.</p>
        <textarea
          value={coverLetterTemplate}
          onChange={e => onUpdate({ coverLetterTemplate: e.target.value })}
          placeholder="Default tone, opening, sign-off preferences..."
          className="w-full h-32 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm resize-none"
        />
        <h3 className="font-bold pt-2">Base Cover Letter</h3>
        <textarea
          value={baseCoverLetter}
          onChange={e => onUpdate({ baseCoverLetter: e.target.value })}
          placeholder="Optional generic cover letter draft..."
          className="w-full h-40 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm resize-none"
        />
      </section>
    </div>
  );
};
