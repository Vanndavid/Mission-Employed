
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BehavioralAnswer, InterviewStage, JobApplication, JobStatus } from '../types';
import { parseJobApplication } from '../services/apiClient';
import { InterviewPrepDrawer } from './InterviewPrepDrawer';
import { CoverLetterStudio } from './CoverLetterStudio';
import { CVStudio } from './CVStudio';
import { exportApplicationsCsv, importApplicationsCsv } from '../utils/csv';

interface PipelineProps {
  applications: JobApplication[];
  behavioralAnswers: BehavioralAnswer[];
  onAdd: (app: Partial<JobApplication>) => void;
  onUpdateStatus: (id: number, s: JobStatus) => void;
  onUpdateApplication: (id: number, partial: Partial<JobApplication>) => void;
  onAddInterviewStage: (appId: number, stage: Omit<InterviewStage, 'id'>) => void;
  onRemoveInterviewStage: (appId: number, stageId: number) => void;
  onDelete: (id: number) => void;
  onBulkImport: (apps: Partial<JobApplication>[]) => void;
  baseCV: string;
  coverLetterTemplate: string;
  cvTemplate: string;
  portfolioUrl: string;
}

export const Pipeline = ({
  applications,
  behavioralAnswers,
  onAdd,
  onUpdateStatus,
  onUpdateApplication,
  onAddInterviewStage,
  onRemoveInterviewStage,
  onDelete,
  onBulkImport,
  baseCV,
  coverLetterTemplate,
  cvTemplate,
  portfolioUrl,
}: PipelineProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const prepAppId = searchParams.get('prep');

  const [isAdding, setIsAdding] = useState(false);
  const [prepApp, setPrepApp] = useState<JobApplication | null>(null);

  const [newApp, setNewApp] = useState<Partial<JobApplication>>({
    company: '',
    role: '',
    url: '',
    notes: '',
    jobDescription: '',
  });
  const [nlText, setNlText] = useState('');
  const [parsingNl, setParsingNl] = useState(false);
  const [coverLetterApp, setCoverLetterApp] = useState<JobApplication | null>(null);
  const [cvApp, setCvApp] = useState<JobApplication | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prepAppId) {
      const app = applications.find(a => a.id === Number(prepAppId));
      if (app) setPrepApp(app);
    }
  }, [prepAppId, applications]);

  useEffect(() => {
    if (prepApp) {
      const updated = applications.find(a => a.id === prepApp.id);
      if (updated) setPrepApp(updated);
    }
  }, [applications, prepApp?.id]);

  const closePrep = () => {
    setPrepApp(null);
    searchParams.delete('prep');
    setSearchParams(searchParams);
  };

  const handleSubmit = () => {
    if (!newApp.company || !newApp.role) return;
    onAdd({
      ...newApp,
      jobDescription: newApp.jobDescription ?? newApp.notes ?? '',
    });
    setNewApp({ company: '', role: '', url: '', notes: '', jobDescription: '' });
    setIsAdding(false);
  };

  const handleNlParse = async () => {
    if (!nlText.trim()) return;
    setParsingNl(true);
    try {
      const parsed = await parseJobApplication(nlText);
      setNewApp(prev => ({
        ...prev,
        company: parsed.company,
        role: parsed.role,
        location: parsed.location ?? '',
        url: parsed.url ?? '',
        notes: parsed.notes ?? nlText,
        jobDescription: parsed.jobDescription ?? parsed.notes ?? nlText,
      }));
      setIsAdding(true);
      setNlText('');
    } catch (e) {
      console.error(e);
    } finally {
      setParsingNl(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportApplicationsCsv(applications);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'applications.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importApplicationsCsv(reader.result as string);
      if (imported.length > 0) onBulkImport(imported);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">The Pipeline</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Track every application from first contact to offer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportCsv} className="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600">
            Export CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
          <button onClick={() => csvInputRef.current?.click()} className="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600">
            Import CSV
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-brand-600/20"
          >
            {isAdding ? 'Cancel' : 'Add Application'}
          </button>
        </div>
      </div>

      <section className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border border-dashed border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">Natural Language Log</h3>
        <p className="text-xs text-slate-400 mb-3">e.g. "Applied to Acme Corp for backend role via LinkedIn yesterday"</p>
        <div className="flex gap-2">
          <input
            value={nlText}
            onChange={e => setNlText(e.target.value)}
            placeholder="Describe the application in plain English..."
            className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            onKeyDown={e => e.key === 'Enter' && handleNlParse()}
          />
          <button
            onClick={handleNlParse}
            disabled={parsingNl || !nlText.trim()}
            className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {parsingNl ? 'Parsing...' : 'Parse & Add'}
          </button>
        </div>
      </section>

      {isAdding && (
        <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Core Details</h3>
            <input
              placeholder="Company Name"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-slate-800 dark:text-slate-200"
              value={newApp.company}
              onChange={e => setNewApp({ ...newApp, company: e.target.value })}
            />
            <input
              placeholder="Job Role"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-slate-800 dark:text-slate-200"
              value={newApp.role}
              onChange={e => setNewApp({ ...newApp, role: e.target.value })}
            />
            <input
              placeholder="URL (Optional)"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-slate-800 dark:text-slate-200"
              value={newApp.url}
              onChange={e => setNewApp({ ...newApp, url: e.target.value })}
            />
            <textarea
              placeholder="Paste the job description here..."
              className="w-full h-48 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm text-slate-800 dark:text-slate-200"
              value={newApp.notes}
              onChange={e => setNewApp({ ...newApp, notes: e.target.value, jobDescription: e.target.value })}
            />
            <div className="flex justify-end">
              <button
                disabled={!newApp.company || !newApp.role}
                onClick={handleSubmit}
                className={`px-8 py-3 rounded-xl font-bold ${
                  newApp.company && newApp.role
                    ? 'bg-brand-600 text-white hover:bg-brand-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                Confirm Mission
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hidden md:block">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs font-bold uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-4">Company / Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Next Action</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                  No missions active. Begin mechanical applying.
                </td>
              </tr>
            ) : (
              applications.map(app => (
                <tr
                  key={app.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  onClick={() => setPrepApp(app)}
                >
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{app.company}</div>
                    <div className="text-sm text-slate-500">{app.role}</div>
                    {(app.interviewStages?.length ?? 0) > 0 && (
                      <span className="text-[10px] text-amber-600 font-bold uppercase">
                        {app.interviewStages.length} stage(s)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                    <select
                      value={app.status}
                      onChange={e => onUpdateStatus(app.id, e.target.value as JobStatus)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1 text-xs font-bold"
                    >
                      {Object.values(JobStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {app.nextAction || '—'}
                    {app.nextActionDue && (
                      <span className="block text-[10px] text-slate-400">
                        Due {new Date(app.nextActionDue).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(app.dateApplied).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onDelete(app.id)} className="text-slate-300 hover:text-rose-500 p-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {applications.length === 0 ? (
          <p className="text-center text-slate-400 italic py-8">No missions active. Begin mechanical applying.</p>
        ) : (
          applications.map(app => (
            <div
              key={app.id}
              onClick={() => setPrepApp(app)}
              className="bg-white dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{app.company}</p>
                  <p className="text-sm text-slate-500">{app.role}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">
                  {app.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center" onClick={e => e.stopPropagation()}>
                <select
                  value={app.status}
                  onChange={e => onUpdateStatus(app.id, e.target.value as JobStatus)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold"
                >
                  {Object.values(JobStatus).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400">
                  {new Date(app.dateApplied).toLocaleDateString()}
                </span>
                <button onClick={() => onDelete(app.id)} className="ml-auto text-rose-400 text-xs font-bold">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {prepApp && (
        <InterviewPrepDrawer
          app={prepApp}
          behavioralAnswers={behavioralAnswers}
          onClose={closePrep}
          onUpdate={partial => onUpdateApplication(prepApp.id, partial)}
          onAddStage={stage => onAddInterviewStage(prepApp.id, stage)}
          onRemoveStage={stageId => onRemoveInterviewStage(prepApp.id, stageId)}
          onOpenCoverLetter={() => setCoverLetterApp(prepApp)}
          onOpenCV={() => setCvApp(prepApp)}
        />
      )}

      {cvApp && (
        <CVStudio
          app={cvApp}
          baseCV={baseCV}
          cvTemplate={cvTemplate}
          portfolioUrl={portfolioUrl}
          onSave={cv => onUpdateApplication(cvApp.id, { tailoredCV: cv })}
          onClose={() => setCvApp(null)}
        />
      )}

      {coverLetterApp && (
        <CoverLetterStudio
          app={coverLetterApp}
          baseCV={baseCV}
          coverLetterTemplate={coverLetterTemplate}
          portfolioUrl={portfolioUrl}
          onSave={letter => onUpdateApplication(coverLetterApp.id, { coverLetter: letter })}
          onClose={() => setCoverLetterApp(null)}
        />
      )}
    </div>
  );
};
