
import React, { useState } from 'react';
import { JobApplication, JobStatus } from '../types';
import { PHASE2_CRITERIA } from '../constants';
import { analyzeJobDescription } from '../services/geminiService';

interface PipelineProps {
  applications: JobApplication[];
  onAdd: (app: Partial<JobApplication>) => void;
  onUpdateStatus: (id: string, s: JobStatus) => void;
  onDelete: (id: string) => void;
}

export const Pipeline = ({ applications, onAdd, onUpdateStatus, onDelete }: PipelineProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newApp, setNewApp] = useState<Partial<JobApplication>>({
    company: '',
    role: '',
    url: '',
    criteriaMet: [],
    notes: ''
  });
  const [analyzing, setAnalyzing] = useState(false);

  const toggleCriteria = (id: string) => {
    setNewApp(prev => ({
      ...prev,
      criteriaMet: prev.criteriaMet?.includes(id) 
        ? prev.criteriaMet.filter(i => i !== id)
        : [...(prev.criteriaMet || []), id]
    }));
  };

  const handleAnalyze = async () => {
    if (!newApp.notes) return;
    setAnalyzing(true);
    try {
      const result = await analyzeJobDescription(newApp.notes);
      setNewApp(prev => ({
        ...prev,
        criteriaMet: result.criteriaMetIds,
        notes: (prev.notes + "\n\n--- AI Analysis ---\n" + result.reasoning).trim()
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = () => {
    if (!newApp.company || !newApp.role) return;
    onAdd(newApp);
    setNewApp({ company: '', role: '', url: '', criteriaMet: [], notes: '' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">The Pipeline</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Apply only to roles meeting 4/8 criteria.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
        >
          {isAdding ? 'Cancel' : 'Add Application'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 animate-in slide-in-from-top duration-300 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Core Details</h3>
              <input 
                placeholder="Company Name" 
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200"
                value={newApp.company}
                onChange={e => setNewApp({...newApp, company: e.target.value})}
              />
              <input 
                placeholder="Job Role (e.g. Backend Engineer)" 
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200"
                value={newApp.role}
                onChange={e => setNewApp({...newApp, role: e.target.value})}
              />
              <input 
                placeholder="URL (Optional)" 
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200"
                value={newApp.url}
                onChange={e => setNewApp({...newApp, url: e.target.value})}
              />
              <textarea 
                placeholder="Paste Job Description here for AI Analysis..." 
                className="w-full h-48 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm text-slate-800 dark:text-slate-200"
                value={newApp.notes}
                onChange={e => setNewApp({...newApp, notes: e.target.value})}
              />
              <button 
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded font-bold text-sm flex items-center justify-center transition-colors"
              >
                {analyzing ? 'Scanning...' : '🧠 Scan with AI'}
              </button>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Criteria Check (Need 4+)</h3>
              <div className="grid grid-cols-1 gap-2">
                {PHASE2_CRITERIA.map(c => (
                  <label key={c.id} className="flex items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={newApp.criteriaMet?.includes(c.id)}
                      onChange={() => toggleCriteria(c.id)}
                    />
                    <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center transition-all ${
                      newApp.criteriaMet?.includes(c.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {newApp.criteriaMet?.includes(c.id) && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="pt-4 flex items-center justify-between">
                <span className={`text-xl font-bold ${newApp.criteriaMet?.length! >= 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  Score: {newApp.criteriaMet?.length}/8
                </span>
                <button 
                  disabled={newApp.criteriaMet?.length! < 4}
                  onClick={handleSubmit}
                  className={`px-8 py-3 rounded-xl font-bold transition-all ${
                    newApp.criteriaMet?.length! >= 4 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xl shadow-emerald-600/20' 
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
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
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-4">Company / Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Criteria</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">No missions active. Begin mechanical applying.</td>
              </tr>
            ) : (
              applications.map(app => (
                <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{app.company}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{app.role}</div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={app.status}
                      onChange={e => onUpdateStatus(app.id, e.target.value as JobStatus)}
                      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        app.status === JobStatus.APPLIED ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 
                        app.status === JobStatus.INTERVIEWING ? 'text-amber-600 dark:text-amber-400 border-amber-500/30' :
                        app.status === JobStatus.OFFER ? 'text-sky-600 dark:text-sky-400 border-sky-500/30' : 'text-slate-500 border-slate-700'
                      }`}
                    >
                      {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                       <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${app.criteriaScore >= 6 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-300'}`}>
                          {app.criteriaScore}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-500">
                    {new Date(app.dateApplied).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onDelete(app.id)}
                      className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors p-2"
                    >
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
    </div>
  );
};
