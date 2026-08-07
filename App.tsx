
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppState, HuntPersonaId, InterviewStage, JobApplication, JobStatus, Criteria, CodingHistoryEntry } from './types';
import { migrateState, createDefaultState } from './utils/migrateState';
import { getTasksForPersona, HUNT_PERSONAS } from './constants';
import { Sidebar, MobileHeader } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Pipeline } from './components/Pipeline';
import { PrepRoom } from './components/PrepRoom';
import { TheCodex } from './components/TheCodex';
import { MockTest } from './components/MockTest';
import { Analytics } from './components/Analytics';
import { PersonaOnboarding } from './components/PersonaOnboarding';
import { Contacts } from './components/Contacts';
import { Profile } from './components/Profile';
import { OfferTools } from './components/OfferTools';
import { DataManagement } from './components/DataManagement';
import { ToastProvider } from './components/ToastProvider';
import { Contact } from './types';
import { getLocalDateString } from './utils';
import { resolveBehavioralTaskId } from './utils/protocolTasks';

const STORAGE_KEY = 'mission_employed_state';
const PERSONA_SET_KEY = 'mission_employed_persona_set';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return migrateState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    return createDefaultState();
  });

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(PERSONA_SET_KEY);
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const dailyTasks = useMemo(() => getTasksForPersona(state.huntPersona), [state.huntPersona]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const handleSelectPersona = (personaId: HuntPersonaId) => {
    const persona = HUNT_PERSONAS[personaId];
    setState(prev => ({
      ...prev,
      huntPersona: personaId,
      customCriteria: persona.criteria,
      targetScore: persona.targetScore,
    }));
    localStorage.setItem(PERSONA_SET_KEY, 'true');
    setShowOnboarding(false);
  };

  const handleSetTaskComplete = (date: string, taskId: string) => {
    setState(prev => {
      const existingLog = prev.dailyLogs[date] || { date, completions: {} };
      if (existingLog.completions[taskId]) return prev;
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [date]: {
            ...existingLog,
            completions: { ...existingLog.completions, [taskId]: true },
          },
        },
      };
    });
  };

  const handleToggleTask = (date: string, taskId: string) => {
    setState(prev => {
      const existingLog = prev.dailyLogs[date] || { date, completions: {} };
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [date]: {
            ...existingLog,
            completions: {
              ...existingLog.completions,
              [taskId]: !existingLog.completions[taskId],
            },
          },
        },
      };
    });
  };

  const handleAddApplication = (newApp: Partial<JobApplication>) => {
    const app: JobApplication = {
      id: crypto.randomUUID(),
      company: newApp.company || 'Unknown',
      role: newApp.role || 'Software Engineer',
      location: newApp.location || '',
      url: newApp.url || '',
      dateApplied: new Date().toISOString(),
      status: newApp.status ?? JobStatus.APPLIED,
      criteriaMet: newApp.criteriaMet || [],
      criteriaScore: newApp.criteriaMet?.length || 0,
      notes: newApp.notes || '',
      jobDescription: newApp.jobDescription ?? newApp.notes ?? '',
      coverLetter: newApp.coverLetter ?? '',
      tailoredCV: newApp.tailoredCV ?? '',
      interviewStages: newApp.interviewStages ?? [],
      nextAction: newApp.nextAction ?? '',
      nextActionDue: newApp.nextActionDue ?? '',
      recruiterContact: newApp.recruiterContact ?? null,
      takeHome: newApp.takeHome ?? null,
      offer: newApp.offer ?? null,
      statusHistory: [{ status: newApp.status ?? JobStatus.APPLIED, date: new Date().toISOString() }],
    };
    setState(prev => ({ ...prev, applications: [app, ...prev.applications] }));
  };

  const handleUpdateAppStatus = (id: string, status: JobStatus) => {
    setState(prev => ({
      ...prev,
      applications: prev.applications.map(a => {
        if (a.id !== id) return a;
        const history = a.statusHistory ?? [];
        return {
          ...a,
          status,
          statusHistory: [...history, { status, date: new Date().toISOString() }],
        };
      }),
    }));
  };

  const handleUpdateApplication = useCallback((id: string, partial: Partial<JobApplication>) => {
    setState(prev => ({
      ...prev,
      applications: prev.applications.map(a => (a.id === id ? { ...a, ...partial } : a)),
    }));
  }, []);

  const handleAddInterviewStage = useCallback((appId: string, stage: Omit<InterviewStage, 'id'>) => {
    setState(prev => ({
      ...prev,
      applications: prev.applications.map(a => {
        if (a.id !== appId) return a;
        return {
          ...a,
          interviewStages: [...(a.interviewStages ?? []), { ...stage, id: crypto.randomUUID() }],
          status: a.status === JobStatus.APPLIED ? JobStatus.INTERVIEWING : a.status,
        };
      }),
    }));
  }, []);

  const handleRemoveInterviewStage = useCallback((appId: string, stageId: string) => {
    setState(prev => ({
      ...prev,
      applications: prev.applications.map(a => {
        if (a.id !== appId) return a;
        return {
          ...a,
          interviewStages: (a.interviewStages ?? []).filter(s => s.id !== stageId),
        };
      }),
    }));
  }, []);

  const handleDeleteApp = (id: string) => {
    if (window.confirm('Terminate mission record?')) {
      setState(prev => ({
        ...prev,
        applications: prev.applications.filter(a => a.id !== id),
      }));
    }
  };

  const handleUpdateBehavioral = (themeId: string, bullets: string[]) => {
    setState(prev => ({
      ...prev,
      behavioralAnswers: prev.behavioralAnswers.map(a =>
        a.themeId === themeId ? { ...a, bullets } : a
      ),
    }));
  };

  const handleUpdateProtocol = (criteria: Criteria[], target: number) => {
    setState(prev => ({ ...prev, customCriteria: criteria, targetScore: target }));
  };

  const handleCodingComplete = (entry: CodingHistoryEntry, taskId: string) => {
    setState(prev => ({
      ...prev,
      codingHistory: [entry, ...prev.codingHistory],
    }));
    const today = new Date().toISOString().slice(0, 10);
    handleSetTaskComplete(today, taskId);
  };

  const handleBulkImport = (apps: Partial<JobApplication>[]) => {
    for (const newApp of apps) {
      handleAddApplication(newApp);
    }
  };

  const handleUpdateProfile = (partial: Partial<Pick<AppState, 'baseCV' | 'cvFileName' | 'baseCoverLetter' | 'portfolioUrl' | 'coverLetterTemplate' | 'cvTemplate'>>) => {
    setState(prev => ({ ...prev, ...partial }));
  };

  const handleAddContact = (contact: Omit<Contact, 'id'>) => {
    setState(prev => ({
      ...prev,
      contacts: [{ ...contact, id: crypto.randomUUID() }, ...prev.contacts],
    }));
  };

  const handleUpdateContact = (id: string, partial: Partial<Contact>) => {
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.map(c => (c.id === id ? { ...c, ...partial } : c)),
    }));
  };

  const handleDeleteContact = (id: string) => {
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.filter(c => c.id !== id),
    }));
  };

  const handleBehavioralComplete = useCallback(() => {
    const today = getLocalDateString();
    setState(prev => {
      const log = prev.dailyLogs[today];
      const completions = log?.completions ?? {};
      const tasks = getTasksForPersona(prev.huntPersona);
      const taskId = resolveBehavioralTaskId(tasks, completions);
      if (!taskId || completions[taskId]) return prev;
      const existingLog = log || { date: today, completions: {} };
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [today]: {
            ...existingLog,
            completions: { ...existingLog.completions, [taskId]: true },
          },
        },
      };
    });
  }, []);

  const handleSimulationComplete = useCallback(() => {
    const today = getLocalDateString();
    setState(prev => {
      const existingLog = prev.dailyLogs[today] || { date: today, completions: {} };
      if (existingLog.completions.simulation) return prev;
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [today]: {
            ...existingLog,
            completions: { ...existingLog.completions, simulation: true },
          },
        },
      };
    });
  }, []);

  const handleImportState = (imported: AppState) => {
    setState(imported);
  };

  const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;

  return (
    <ToastProvider>
    <BrowserRouter basename={routerBasename}>
      <div className="min-h-screen text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
        <Sidebar
          theme={theme}
          toggleTheme={toggleTheme}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <div className="flex-1 lg:ml-64 min-h-screen flex flex-col">
          <MobileHeader onMenuOpen={() => setMobileNavOpen(true)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <Dashboard
                    logs={state.dailyLogs}
                    applications={state.applications}
                    dailyTasks={dailyTasks}
                    huntPersona={state.huntPersona}
                    codingHistory={state.codingHistory}
                    onToggleTask={handleToggleTask}
                    onCodingComplete={handleCodingComplete}
                  />
                }
              />
              <Route path="/analytics" element={<Analytics state={state} />} />
              <Route
                path="/applications"
                element={
                  <Pipeline
                    applications={state.applications}
                    behavioralAnswers={state.behavioralAnswers}
                    criteria={state.customCriteria}
                    targetScore={state.targetScore}
                    huntPersona={state.huntPersona}
                    onAdd={handleAddApplication}
                    onUpdateStatus={handleUpdateAppStatus}
                    onUpdateApplication={handleUpdateApplication}
                    onAddInterviewStage={handleAddInterviewStage}
                    onRemoveInterviewStage={handleRemoveInterviewStage}
                    onDelete={handleDeleteApp}
                    onUpdateProtocol={handleUpdateProtocol}
                    onBulkImport={handleBulkImport}
                    baseCV={state.baseCV}
                    coverLetterTemplate={state.coverLetterTemplate}
                    cvTemplate={state.cvTemplate}
                    portfolioUrl={state.portfolioUrl}
                  />
                }
              />
              <Route
                path="/applications/criteria"
                element={
                  <Pipeline
                    applications={state.applications}
                    behavioralAnswers={state.behavioralAnswers}
                    criteria={state.customCriteria}
                    targetScore={state.targetScore}
                    huntPersona={state.huntPersona}
                    onAdd={handleAddApplication}
                    onUpdateStatus={handleUpdateAppStatus}
                    onUpdateApplication={handleUpdateApplication}
                    onAddInterviewStage={handleAddInterviewStage}
                    onRemoveInterviewStage={handleRemoveInterviewStage}
                    onDelete={handleDeleteApp}
                    onUpdateProtocol={handleUpdateProtocol}
                    onBulkImport={handleBulkImport}
                    baseCV={state.baseCV}
                    coverLetterTemplate={state.coverLetterTemplate}
                    cvTemplate={state.cvTemplate}
                    portfolioUrl={state.portfolioUrl}
                    openConfig
                  />
                }
              />
              <Route
                path="/applications/contacts"
                element={
                  <Contacts
                    contacts={state.contacts}
                    applications={state.applications}
                    onAddContact={handleAddContact}
                    onUpdateContact={handleUpdateContact}
                    onDeleteContact={handleDeleteContact}
                  />
                }
              />
              <Route
                path="/applications/profile"
                element={
                  <Profile
                    baseCV={state.baseCV}
                    cvFileName={state.cvFileName}
                    baseCoverLetter={state.baseCoverLetter}
                    portfolioUrl={state.portfolioUrl}
                    coverLetterTemplate={state.coverLetterTemplate}
                    cvTemplate={state.cvTemplate}
                    onUpdate={handleUpdateProfile}
                  />
                }
              />
              <Route
                path="/applications/offers"
                element={
                  <OfferTools
                    applications={state.applications}
                    onUpdateApplication={handleUpdateApplication}
                  />
                }
              />
              <Route path="/prep" element={<PrepRoom answers={state.behavioralAnswers} onUpdateAnswer={handleUpdateBehavioral} onBehavioralComplete={handleBehavioralComplete} />} />
              <Route
                path="/mock"
                element={<MockTest applications={state.applications} behavioralAnswers={state.behavioralAnswers} onSimulationComplete={handleSimulationComplete} />}
              />
              <Route path="/rules" element={<TheCodex />} />
            </Routes>
          </div>
          </main>
        </div>

        <DataManagement state={state} onImport={handleImportState} />

        {showOnboarding && <PersonaOnboarding onSelect={handleSelectPersona} />}
      </div>
    </BrowserRouter>
    </ToastProvider>
  );
}
