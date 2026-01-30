
import React, { useState, useEffect } from 'react';
import { AppState, JobApplication, JobStatus, Criteria } from './types';
import { BEHAVIORAL_THEMES, PHASE2_CRITERIA } from './constants';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Pipeline } from './components/Pipeline';
import { PrepRoom } from './components/PrepRoom';
import { TheCodex } from './components/TheCodex';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  
  // Local Storage State Persistence
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('mission_employed_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration for old state if needed
      if (!parsed.customCriteria) parsed.customCriteria = PHASE2_CRITERIA;
      if (!parsed.targetScore) parsed.targetScore = 4;
      return parsed;
    }
    return {
      applications: [],
      dailyLogs: {},
      behavioralAnswers: BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] })),
      customCriteria: PHASE2_CRITERIA,
      targetScore: 4,
      baseCV: '',
      baseCoverLetter: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('mission_employed_state', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handlers
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const handleToggleTask = (date: string, taskId: string) => {
    setState(prev => {
      const existingLog = prev.dailyLogs[date] || { date, completions: {} };
      const newCompletions = { 
        ...existingLog.completions, 
        [taskId]: !existingLog.completions[taskId] 
      };
      
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [date]: { ...existingLog, completions: newCompletions }
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

  const handleUpdateProtocol = (criteria: Criteria[], target: number) => {
    setState(prev => ({
      ...prev,
      customCriteria: criteria,
      targetScore: target
    }));
  };

  // Rendering
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} toggleTheme={toggleTheme} />
      
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
              criteria={state.customCriteria}
              targetScore={state.targetScore}
              onUpdateProtocol={handleUpdateProtocol}
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
           className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold shadow-sm"
           title="Export State"
         >
           Export Data
         </button>
      </footer>
    </div>
  );
}
