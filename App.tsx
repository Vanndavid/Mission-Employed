
import React, { useState, useEffect, useMemo } from 'react';
import { AppState, JobApplication, JobStatus, DailyLog, BehavioralAnswer } from './types';
import { PHASE2_CRITERIA, BEHAVIORAL_THEMES, MENTAL_RULES } from './constants';
import { generateCodingProblem, generateBehavioralPrompt, analyzeJobDescription } from './services/geminiService';

// --- Helper Functions ---

const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const getRecentWeekdays = (count: number) => {
  const dates: string[] = [];
  let d = new Date();
  while (dates.length < count) {
    if (isWeekday(d)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
};

// --- Sub-components ---

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const tabs = [
    { id: 'dashboard', label: 'Mission Control', icon: '🚀' },
    { id: 'applications', label: 'Pipeline', icon: '📁' },
    { id: 'prep', label: 'Training Room', icon: '🧠' },
    { id: 'rules', label: 'The Codex', icon: '📜' },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold text-emerald-500 tracking-tight">MISSION: EMPLOYED</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Mechanical Execution</p>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span className="mr-3 text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="p-4 bg-slate-800/50 m-4 rounded-xl border border-slate-700">
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Mental Rule #1</h3>
        <p className="text-sm text-slate-300">"Applying is mechanical, not strategic."</p>
      </div>
    </div>
  );
};

const Dashboard = ({ logs, onToggleTask }: { logs: Record<string, DailyLog>, onToggleTask: (date: string, task: keyof DailyLog) => void }) => {
  const today = new Date().toISOString().split('T')[0];
  const currentLog = logs[today] || { date: today, codingEasy: false, codingMedium: false, behavioral: false, simulation: false };

  const [aiProblem, setAiProblem] = useState<{ title: string, description: string, examples: string[] } | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);

  const fetchProblem = async (diff: 'easy' | 'medium') => {
    setLoadingProblem(true);
    try {
      const p = await generateCodingProblem(diff);
      setAiProblem(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProblem(false);
    }
  };

  // Calculate Streak and History
  const historyDates = useMemo(() => getRecentWeekdays(28).reverse(), [logs]);
  
  const streakData = useMemo(() => {
    let currentStreak = 0;
    const sortedWeekdays = getRecentWeekdays(100); 
    
    for (const date of sortedWeekdays) {
      const log = logs[date];
      const isComplete = log && log.codingEasy && log.codingMedium && log.behavioral && log.simulation;
      
      if (isComplete) {
        currentStreak++;
      } else {
        if (date !== today) break;
      }
    }
    return currentStreak;
  }, [logs, today]);

  const taskStats = [
    { id: 'codingEasy', label: '1 Easy Problem', time: '60-90m (Combined)' },
    { id: 'codingMedium', label: '1 Medium Problem', time: '60-90m (Combined)' },
    { id: 'behavioral', label: 'Behavioral Prep', time: '20-30m' },
    { id: 'simulation', label: 'Interview Sim', time: '10m' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">Daily Requirements</h2>
        <p className="text-slate-400 mt-2">Zero judgment. Just execution. Weekday protocol.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {taskStats.map((task) => (
          <div 
            key={task.id}
            onClick={() => onToggleTask(today, task.id as keyof DailyLog)}
            className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
              currentLog[task.id as keyof DailyLog] 
                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5' 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${currentLog[task.id as keyof DailyLog] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                {currentLog[task.id as keyof DailyLog] && <span className="text-white text-xs">✓</span>}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{task.time}</span>
            </div>
            <h3 className="font-bold text-lg">{task.label}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center">
                <span className="mr-2">🧩</span> Training Prompt
              </h3>
              <div className="space-x-2">
                <button 
                  onClick={() => fetchProblem('easy')}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  Get Easy
                </button>
                <button 
                  onClick={() => fetchProblem('medium')}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold transition-colors"
                  disabled={loadingProblem}
                >
                  Get Medium
                </button>
              </div>
            </div>
            
            {loadingProblem ? (
              <div className="h-48 flex items-center justify-center text-slate-500 animate-pulse">
                Engaging Intelligence Core...
              </div>
            ) : aiProblem ? (
              <div className="space-y-4">
                <h4 className="text-lg font-bold text-emerald-400 underline decoration-emerald-500/30 underline-offset-4">{aiProblem.title}</h4>
                <div className="p-4 bg-slate-900 rounded-lg mono text-sm leading-relaxed text-slate-300">
                  {aiProblem.description}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase">Examples:</p>
                  {aiProblem.examples.map((ex, i) => (
                    <div key={i} className="text-xs bg-slate-900 p-2 rounded border border-slate-800 mono text-emerald-300/70">{ex}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic">
                Fetch a problem to begin your daily practice session.
              </div>
            )}
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <span className="mr-2">📅</span> Protocol History (Last 28 Weekdays)
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-2">
              {historyDates.map(date => {
                const log = logs[date];
                const isComplete = log && log.codingEasy && log.codingMedium && log.behavioral && log.simulation;
                const d = new Date(date);
                const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                const dateLabel = d.getDate();
                
                return (
                  <div key={date} className="group relative">
                    <div className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-all ${
                      isComplete ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-900/50 border-slate-800'
                    }`}>
                      <div className="grid grid-cols-2 gap-1 p-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.codingEasy ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.codingMedium ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.behavioral ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full ${log?.simulation ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                      </div>
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {dayLabel} {dateLabel}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-center space-x-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></div> Completed</div>
              <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-slate-700 mr-2"></div> Pending</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <span className="mr-2">🔥</span> Current Streak
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-48">
                 {/* Fixed SVG: Added viewBox and adjusted cx/cy/r to prevent clipping. Start from top by rotating SVG -90deg. */}
                 <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="90" 
                      stroke="currentColor" 
                      strokeWidth="12" 
                      fill="transparent" 
                      className="text-slate-800" 
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
                 {/* Text center div: Removed inner rotation that was causing the vertical flip. */}
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-slate-100 tracking-tighter">{streakData}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em] mt-1">Weekdays</span>
                 </div>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-400 text-center italic">"The only way out is through the protocol."</p>
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-slate-500 font-bold uppercase tracking-widest">Next Milestone</span>
                  <span className="text-emerald-400 font-bold">{Math.max(5, Math.ceil((streakData + 1) / 5) * 5)} Days</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
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

const Pipeline = ({ applications, onAdd, onUpdateStatus, onDelete }: { 
  applications: JobApplication[], 
  onAdd: (app: Partial<JobApplication>) => void,
  onUpdateStatus: (id: string, s: JobStatus) => void,
  onDelete: (id: string) => void
}) => {
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
          <h2 className="text-3xl font-bold">The Pipeline</h2>
          <p className="text-slate-400 mt-2">Apply only to roles meeting 4/8 criteria.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
        >
          {isAdding ? 'Cancel' : 'Add Application'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-slate-800/80 rounded-2xl p-8 border border-slate-700 animate-in slide-in-from-top duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-300">Core Details</h3>
              <input 
                placeholder="Company Name" 
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                value={newApp.company}
                onChange={e => setNewApp({...newApp, company: e.target.value})}
              />
              <input 
                placeholder="Job Role (e.g. Backend Engineer)" 
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                value={newApp.role}
                onChange={e => setNewApp({...newApp, role: e.target.value})}
              />
              <input 
                placeholder="URL (Optional)" 
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                value={newApp.url}
                onChange={e => setNewApp({...newApp, url: e.target.value})}
              />
              <textarea 
                placeholder="Paste Job Description here for AI Analysis..." 
                className="w-full h-48 bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                value={newApp.notes}
                onChange={e => setNewApp({...newApp, notes: e.target.value})}
              />
              <button 
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-bold text-sm flex items-center justify-center transition-colors"
              >
                {analyzing ? 'Scanning...' : '🧠 Scan with AI'}
              </button>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-300">Criteria Check (Need 4+)</h3>
              <div className="grid grid-cols-1 gap-2">
                {PHASE2_CRITERIA.map(c => (
                  <label key={c.id} className="flex items-center p-3 rounded-lg bg-slate-900/50 border border-slate-700 cursor-pointer hover:border-emerald-500/50 transition-colors group">
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={newApp.criteriaMet?.includes(c.id)}
                      onChange={() => toggleCriteria(c.id)}
                    />
                    <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center transition-all ${
                      newApp.criteriaMet?.includes(c.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                    }`}>
                      {newApp.criteriaMet?.includes(c.id) && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="text-sm text-slate-300 group-hover:text-emerald-400 transition-colors">{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="pt-4 flex items-center justify-between">
                <span className={`text-xl font-bold ${newApp.criteriaMet?.length! >= 4 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Score: {newApp.criteriaMet?.length}/8
                </span>
                <button 
                  disabled={newApp.criteriaMet?.length! < 4}
                  onClick={handleSubmit}
                  className={`px-8 py-3 rounded-xl font-bold transition-all ${
                    newApp.criteriaMet?.length! >= 4 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xl shadow-emerald-600/20' 
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Confirm Mission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/50 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-700">
            <tr>
              <th className="px-6 py-4">Company / Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Criteria</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">No missions active. Begin mechanical applying.</td>
              </tr>
            ) : (
              applications.map(app => (
                <tr key={app.id} className="hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-200">{app.company}</div>
                    <div className="text-sm text-slate-400">{app.role}</div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={app.status}
                      onChange={e => onUpdateStatus(app.id, e.target.value as JobStatus)}
                      className={`bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        app.status === JobStatus.APPLIED ? 'text-emerald-400 border-emerald-500/30' : 
                        app.status === JobStatus.INTERVIEWING ? 'text-amber-400 border-amber-500/30' :
                        app.status === JobStatus.OFFER ? 'text-sky-400 border-sky-500/30' : 'text-slate-500 border-slate-700'
                      }`}
                    >
                      {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                       <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${app.criteriaScore >= 6 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-300'}`}>
                          {app.criteriaScore}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(app.dateApplied).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onDelete(app.id)}
                      className="text-slate-600 hover:text-rose-500 transition-colors p-2"
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

const PrepRoom = ({ answers, onUpdateAnswer }: { 
  answers: BehavioralAnswer[], 
  onUpdateAnswer: (themeId: string, bullets: string[]) => void 
}) => {
  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const activeTheme = BEHAVIORAL_THEMES.find(t => t.id === activeThemeId)!;
  const activeAnswer = answers.find(a => a.themeId === activeThemeId) || { themeId: activeThemeId, bullets: [''] };

  const handleFetchPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const p = await generateBehavioralPrompt(activeTheme.label);
      setCurrentPrompt(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const updateBullet = (index: number, val: string) => {
    const newBullets = [...activeAnswer.bullets];
    newBullets[index] = val;
    onUpdateAnswer(activeThemeId, newBullets);
  };

  const addBullet = () => {
    onUpdateAnswer(activeThemeId, [...activeAnswer.bullets, '']);
  };

  const removeBullet = (index: number) => {
    if (activeAnswer.bullets.length === 1) return;
    const newBullets = activeAnswer.bullets.filter((_, i) => i !== index);
    onUpdateAnswer(activeThemeId, newBullets);
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">Training Room</h2>
        <p className="text-slate-400 mt-2">Bullet points only. No storytelling yet. Remove improvisation.</p>
      </header>

      <div className="flex space-x-2 overflow-x-auto pb-4 no-scrollbar">
        {BEHAVIORAL_THEMES.map(theme => (
          <button 
            key={theme.id}
            onClick={() => { setActiveThemeId(theme.id); setCurrentPrompt(''); }}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
              activeThemeId === theme.id ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
            }`}
          >
            {theme.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-emerald-400">{activeTheme.label} Protocol</h3>
                <button 
                  onClick={handleFetchPrompt}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold transition-colors"
                  disabled={loadingPrompt}
                >
                  {loadingPrompt ? 'Loading...' : 'Get Prompt'}
                </button>
             </div>

             {currentPrompt && (
               <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                 <p className="text-sm font-medium text-emerald-300 italic">" {currentPrompt.trim()} "</p>
               </div>
             )}

             <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase">Bullet Points (Raw Facts)</p>
                {activeAnswer.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex space-x-2">
                    <input 
                      className="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      placeholder="Enter a raw detail..."
                      value={bullet}
                      onChange={(e) => updateBullet(idx, e.target.value)}
                    />
                    <button 
                      onClick={() => removeBullet(idx)}
                      className="text-slate-600 hover:text-rose-500 px-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button 
                  onClick={addBullet}
                  className="text-xs font-bold text-emerald-500 hover:text-emerald-400"
                >
                  + Add Point
                </button>
             </div>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 border-dashed flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl mb-4">⏱️</div>
            <h3 className="text-xl font-bold mb-2">Simulation Protocol</h3>
            <p className="text-slate-400 text-sm max-w-xs mb-6">
              Pick one question and answer it out loud. 10 minutes max. No judgment. Just exposure to the pressure.
            </p>
            <button className="bg-slate-800 hover:bg-slate-700 px-8 py-3 rounded-xl text-sm font-bold border border-slate-700 transition-all">
              Start Timer
            </button>
        </div>
      </div>
    </div>
  );
};

const TheCodex = () => {
  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-3xl font-bold">The Codex</h2>
        <p className="text-slate-400 mt-2">Non-negotiable rules for the mission.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h3 className="text-xl font-bold text-rose-500 flex items-center">
            <span className="mr-2">❌</span> HARD NEGATIVES
          </h3>
          <ul className="space-y-4">
            {MENTAL_RULES.donts.map((rule, i) => (
              <li key={i} className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl text-slate-300 font-medium">
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <h3 className="text-xl font-bold text-emerald-500 flex items-center">
            <span className="mr-2">✅</span> HARD POSITIVES
          </h3>
          <ul className="space-y-4">
            {MENTAL_RULES.dos.map((rule, i) => (
              <li key={i} className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl text-slate-300 font-medium">
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        <h3 className="text-xl font-bold mb-6">Phase 2 Guidelines</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Volume</h4>
            <p className="text-lg font-bold">2 Applications / Day</p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Consistency</h4>
            <p className="text-lg font-bold">Same CV & Cover Letter</p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Mindset</h4>
            <p className="text-lg font-bold text-rose-400">No Emotional Analysis</p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Target</h4>
            <p className="text-lg font-bold">Mechanical Targets Only</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Implementation ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Local Storage State Persistence
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('mission_employed_state');
    if (saved) return JSON.parse(saved);
    return {
      applications: [],
      dailyLogs: {},
      behavioralAnswers: BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] })),
      baseCV: '',
      baseCoverLetter: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('mission_employed_state', JSON.stringify(state));
  }, [state]);

  // Handlers
  const handleToggleTask = (date: string, task: keyof DailyLog) => {
    setState(prev => {
      const currentLog = prev.dailyLogs[date] || { date, codingEasy: false, codingMedium: false, behavioral: false, simulation: false };
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [date]: { ...currentLog, [task]: !currentLog[task as keyof DailyLog] }
        }
      };
    });
  };

  const handleAddApplication = (newApp: Partial<JobApplication>) => {
    const app: JobApplication = {
      id: crypto.randomUUID(),
      company: newApp.company || 'Unknown',
      role: newApp.role || 'Software Engineer',
      url: newApp.url || '',
      dateApplied: new Date().toISOString(),
      status: JobStatus.APPLIED,
      criteriaMet: newApp.criteriaMet || [],
      criteriaScore: newApp.criteriaMet?.length || 0,
      notes: newApp.notes || ''
    };
    setState(prev => ({
      ...prev,
      applications: [app, ...prev.applications]
    }));
  };

  const handleUpdateAppStatus = (id: string, status: JobStatus) => {
    setState(prev => ({
      ...prev,
      applications: prev.applications.map(a => a.id === id ? { ...a, status } : a)
    }));
  };

  const handleDeleteApp = (id: string) => {
    if (window.confirm('Terminate mission record?')) {
      setState(prev => ({
        ...prev,
        applications: prev.applications.filter(a => a.id !== id)
      }));
    }
  };

  const handleUpdateBehavioral = (themeId: string, bullets: string[]) => {
    setState(prev => ({
      ...prev,
      behavioralAnswers: prev.behavioralAnswers.map(a => a.themeId === themeId ? { ...a, bullets } : a)
    }));
  };

  // Rendering
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="ml-64 flex-1 p-8 min-h-screen">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && (
            <Dashboard logs={state.dailyLogs} onToggleTask={handleToggleTask} />
          )}
          {activeTab === 'applications' && (
            <Pipeline 
              applications={state.applications} 
              onAdd={handleAddApplication} 
              onUpdateStatus={handleUpdateAppStatus} 
              onDelete={handleDeleteApp} 
            />
          )}
          {activeTab === 'prep' && (
            <PrepRoom 
              answers={state.behavioralAnswers} 
              onUpdateAnswer={handleUpdateBehavioral} 
            />
          )}
          {activeTab === 'rules' && (
            <TheCodex />
          )}
        </div>
      </main>

      {/* Persistence Export/Import Footer */}
      <footer className="fixed bottom-4 right-4 flex space-x-2">
         <button 
           onClick={() => {
             const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
             const downloadAnchorNode = document.createElement('a');
             downloadAnchorNode.setAttribute("href", dataStr);
             downloadAnchorNode.setAttribute("download", "mission_data.json");
             document.body.appendChild(downloadAnchorNode);
             downloadAnchorNode.click();
             downloadAnchorNode.remove();
           }}
           className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg border border-slate-700 text-slate-500 text-xs font-bold"
           title="Export State"
         >
           Export Data
         </button>
      </footer>
    </div>
  );
}
