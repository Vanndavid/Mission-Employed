
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BehavioralAnswer, HuntPersonaId, InterviewStage, JobApplication, JobStatus, Criteria } from '../types';
import { analyzeJobDescription } from '../services/apiClient';
import { HUNT_PERSONAS } from '../constants';
import { InterviewPrepDrawer } from './InterviewPrepDrawer';

interface PipelineProps {
  applications: JobApplication[];
  behavioralAnswers: BehavioralAnswer[];
  criteria: Criteria[];
  targetScore: number;
  huntPersona: HuntPersonaId;
  onAdd: (app: Partial<JobApplication>) => void;
  onUpdateStatus: (id: string, s: JobStatus) => void;
  onUpdateApplication: (id: string, partial: Partial<JobApplication>) => void;
  onAddInterviewStage: (appId: string, stage: Omit<InterviewStage, 'id'>) => void;
  onRemoveInterviewStage: (appId: string, stageId: string) => void;
  onDelete: (id: string) => void;
  onUpdateProtocol: (criteria: Criteria[], target: number) => void;
  openConfig?: boolean;
}

export const Pipeline = ({
  applications,
  behavioralAnswers,
  criteria,
  targetScore,
  huntPersona,
  onAdd,
  onUpdateStatus,
  onUpdateApplication,
  onAddInterviewStage,
  onRemoveInterviewStage,
  onDelete,
  onUpdateProtocol,
  openConfig = false,
}: PipelineProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const prepAppId = searchParams.get('prep');

  const [isAdding, setIsAdding] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(openConfig);
  const [tempCriteria, setTempCriteria] = useState<Criteria[]>(criteria);
  const [tempTarget, setTempTarget] = useState(targetScore);
  const [prepApp, setPrepApp] = useState<JobApplication | null>(null);

  const [newApp, setNewApp] = useState<Partial<JobApplication>>({
    company: '',
    role: '',
    url: '',
    criteriaMet: [],
    notes: '',
    jobDescription: '',
  });
  const [analyzing, setAnalyzing] = useState(false);

  const persona = HUNT_PERSONAS[huntPersona];

  useEffect(() => {
    if (prepAppId) {
      const app = applications.find(a => a.id === prepAppId);
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

  const toggleCriteria = (id: string) => {
    setNewApp(prev => ({
      ...prev,
      criteriaMet: prev.criteriaMet?.includes(id)
        ? prev.criteriaMet.filter(i => i !== id)
        : [...(prev.criteriaMet || []), id],
    }));
  };

  const handleAnalyze = async () => {
    const jd = newApp.notes || newApp.jobDescription;
    if (!jd) return;
    setAnalyzing(true);
    try {
      const result = await analyzeJobDescription(jd, criteria);
      setNewApp(prev => ({
        ...prev,
        criteriaMet: result.criteriaMetIds,
        jobDescription: jd,
        notes: (prev.notes + '\n\n--- AI Analysis ---\n' + result.reasoning).trim(),
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = () => {
    if (!newApp.company || !newApp.role) return;
    onAdd({
      ...newApp,
      jobDescription: newApp.jobDescription ?? newApp.notes ?? '',
    });
    setNewApp({ company: '', role: '', url: '', criteriaMet: [], notes: '', jobDescription: '' });
    setIsAdding(false);
  };

  const handleSaveProtocol = () => {
    onUpdateProtocol(tempCriteria, tempTarget);
    setIsConfiguring(false);
  };

  const updateCriteriaLabel = (index: number, label: string) => {
    const next = [...tempCriteria];
    next[index] = { ...next[index], label };
    setTempCriteria(next);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">The Pipeline</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            {persona.label} · Apply only to roles meeting {targetScore}/{criteria.length} criteria.
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => { setIsConfiguring(!isConfiguring); setIsAdding(false); }}
            className={`px-4 py-2 rounded-xl font-bold transition-all border ${
              isConfiguring
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                : 'text-slate-500 hover:text-emerald-600 border-slate-200 dark:border-slate-700'
            }`}
          >
            ⚙️ Protocol Settings
          </button>
          <button
            onClick={() => { setIsAdding(!isAdding); setIsConfiguring(false); }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
          >
            {isAdding ? 'Cancel' : 'Add Application'}
          </button>
        </div>
      </div>

      {isConfiguring && (
        <div className="bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-slate-100">
              Configure Mission Parameters
            </h3>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Score:</span>
              <input
                type="number"
                min="1"
                max={tempCriteria.length}
                value={tempTarget}
                onChange={e => setTempTarget(parseInt(e.target.value))}
                className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg font-black text-center text-emerald-600 dark:text-emerald-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {tempCriteria.map((c, i) => (
              <div key={c.id} className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Criterion {i + 1}</span>
                <input
                  value={c.label}
                  onChange={e => updateCriteriaLabel(i, e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800 dark:text-slate-100"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveProtocol}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/10"
          >
            Lock-in New Protocol
          </button>
        </div>
      )}

      {isAdding && (
        <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
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
                placeholder="Paste Job Description here for AI Analysis..."
                className="w-full h-48 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm text-slate-800 dark:text-slate-200"
                value={newApp.notes}
                onChange={e => setNewApp({ ...newApp, notes: e.target.value, jobDescription: e.target.value })}
              />
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded font-bold text-sm"
              >
                {analyzing ? 'Scanning...' : '🧠 Scan with AI'}
              </button>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Criteria Check (Need {targetScore}+)</h3>
              <div className="grid grid-cols-1 gap-2">
                {criteria.map(c => (
                  <label
                    key={c.id}
                    className="flex items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-emerald-500/50"
                  >
                    <input type="checkbox" className="hidden" checked={newApp.criteriaMet?.includes(c.id)} onChange={() => toggleCriteria(c.id)} />
                    <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center ${newApp.criteriaMet?.includes(c.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                      {newApp.criteriaMet?.includes(c.id) && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="pt-4 flex items-center justify-between">
                <span className={`text-xl font-bold ${(newApp.criteriaMet?.length ?? 0) >= targetScore ? 'text-emerald-600' : 'text-rose-500'}`}>
                  Score: {newApp.criteriaMet?.length}/{criteria.length}
                </span>
                <button
                  disabled={(newApp.criteriaMet?.length ?? 0) < targetScore}
                  onClick={handleSubmit}
                  className={`px-8 py-3 rounded-xl font-bold ${
                    (newApp.criteriaMet?.length ?? 0) >= targetScore
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Confirm Mission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs font-bold uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-4">Company / Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Next Action</th>
              <th className="px-6 py-4">Criteria</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
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
                  <td className="px-6 py-4">
                    <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center font-bold text-xs ${app.criteriaScore >= targetScore ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {app.criteriaScore}
                    </span>
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

      {prepApp && (
        <InterviewPrepDrawer
          app={prepApp}
          behavioralAnswers={behavioralAnswers}
          onClose={closePrep}
          onUpdate={partial => onUpdateApplication(prepApp.id, partial)}
          onAddStage={stage => onAddInterviewStage(prepApp.id, stage)}
          onRemoveStage={stageId => onRemoveInterviewStage(prepApp.id, stageId)}
        />
      )}
    </div>
  );
};
