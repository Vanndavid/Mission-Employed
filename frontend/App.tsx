
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppState, InterviewStage, JobApplication, JobStatus, CodingHistoryEntry } from './types';
import { migrateState, createDefaultState } from './utils/migrateState';
import { Sidebar, MobileHeader } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Pipeline } from './components/Pipeline';
import { PrepRoom } from './components/PrepRoom';
import { MockTest } from './components/MockTest';
import { Profile } from './components/Profile';
import { ToastProvider } from './components/ToastProvider';
import { AuthScreen } from './components/AuthScreen';
import { AccountPage } from './components/AccountPage';
import { AdminUsersPage } from './components/AdminUsersPage';
import { PremiumGate } from './components/PremiumGate';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  applyTheme,
  ColorMode,
  loadStoredMode,
  loadStoredPalette,
  ThemePalette,
} from './themes';

const STORAGE_KEY = 'mission_employed_state';

function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<ColorMode>(() => loadStoredMode());
  const [palette, setPalette] = useState<ThemePalette>(() => loadStoredPalette());

  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return migrateState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    return createDefaultState();
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('theme', mode);
    localStorage.setItem('theme_palette', palette);
    applyTheme(palette, mode);
  }, [mode, palette]);

  const handleAddApplication = (newApp: Partial<JobApplication>) => {
    const app: JobApplication = {
      id: crypto.randomUUID(),
      company: newApp.company || 'Unknown',
      role: newApp.role || 'Software Engineer',
      location: newApp.location || '',
      url: newApp.url || '',
      dateApplied: new Date().toISOString(),
      status: newApp.status ?? JobStatus.APPLIED,
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

  const handleCodingComplete = (entry: CodingHistoryEntry) => {
    setState(prev => ({
      ...prev,
      codingHistory: [entry, ...prev.codingHistory],
    }));
  };

  const handleBulkImport = (apps: Partial<JobApplication>[]) => {
    for (const newApp of apps) {
      handleAddApplication(newApp);
    }
  };

  const handleUpdateProfile = (partial: Partial<Pick<AppState, 'baseCV' | 'cvFileName' | 'baseCoverLetter' | 'portfolioUrl' | 'coverLetterTemplate' | 'cvTemplate'>>) => {
    setState(prev => ({ ...prev, ...partial }));
  };

  const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-500 text-sm font-bold uppercase tracking-widest">
        Loading account…
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <BrowserRouter basename={routerBasename}>
      <div className="min-h-screen text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
        <Sidebar
          mode={mode}
          palette={palette}
          onModeChange={setMode}
          onPaletteChange={setPalette}
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
                    applications={state.applications}
                    codingHistory={state.codingHistory}
                    onCodingComplete={handleCodingComplete}
                  />
                }
              />
              <Route
                path="/applications"
                element={
                  <Pipeline
                    applications={state.applications}
                    behavioralAnswers={state.behavioralAnswers}
                    onAdd={handleAddApplication}
                    onUpdateStatus={handleUpdateAppStatus}
                    onUpdateApplication={handleUpdateApplication}
                    onAddInterviewStage={handleAddInterviewStage}
                    onRemoveInterviewStage={handleRemoveInterviewStage}
                    onDelete={handleDeleteApp}
                    onBulkImport={handleBulkImport}
                    baseCV={state.baseCV}
                    coverLetterTemplate={state.coverLetterTemplate}
                    cvTemplate={state.cvTemplate}
                    portfolioUrl={state.portfolioUrl}
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
              <Route path="/prep" element={<PrepRoom answers={state.behavioralAnswers} onUpdateAnswer={handleUpdateBehavioral} />} />
              <Route
                path="/mock"
                element={
                  <PremiumGate title="Mock interview (Premium)">
                    <MockTest applications={state.applications} behavioralAnswers={state.behavioralAnswers} />
                  </PremiumGate>
                }
              />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/admin" element={<AdminUsersPage />} />
            </Routes>
          </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
