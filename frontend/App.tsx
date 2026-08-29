
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
  DataProvider,
  useApplications,
  useBehavioralAnswers,
  useCodingHistory,
  useProfile,
} from './contexts/DataProvider';
import {
  applyTheme,
  ColorMode,
  loadStoredMode,
  loadStoredPalette,
  ThemePalette,
} from './themes';

/**
 * Routes and the data they are given.
 *
 * App no longer owns any domain state: the four providers under
 * contexts/DataProvider hold it and the API is the source of truth. This
 * component only reads those hooks and hands the screens the same props they
 * were written against, so wiring them to the API directly (tasks 3.2 to 3.5)
 * is a change inside each screen rather than a change to this file.
 */
function AppRoutes() {
  const {
    applications,
    addApplication,
    updateApplication,
    updateStatus,
    deleteApplication,
    addInterviewStage,
    removeInterviewStage,
    importApplications,
  } = useApplications();
  const { profile, updateProfile } = useProfile();
  const { codingHistory, addAttempt } = useCodingHistory();
  const { answers, updateAnswer } = useBehavioralAnswers();

  const handleDelete = (id: number) => {
    if (window.confirm('Terminate mission record?')) {
      void deleteApplication(id);
    }
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <Dashboard
            applications={applications}
            codingHistory={codingHistory}
            onCodingComplete={addAttempt}
          />
        }
      />
      <Route
        path="/applications"
        element={
          <Pipeline
            applications={applications}
            behavioralAnswers={answers}
            onAdd={addApplication}
            onUpdateStatus={updateStatus}
            onUpdateApplication={updateApplication}
            onAddInterviewStage={addInterviewStage}
            onRemoveInterviewStage={removeInterviewStage}
            onDelete={handleDelete}
            onBulkImport={importApplications}
            baseCV={profile.baseCV}
            coverLetterTemplate={profile.coverLetterTemplate}
            cvTemplate={profile.cvTemplate}
            portfolioUrl={profile.portfolioUrl}
          />
        }
      />
      <Route
        path="/applications/profile"
        element={
          <Profile
            baseCV={profile.baseCV}
            cvFileName={profile.cvFileName}
            baseCoverLetter={profile.baseCoverLetter}
            portfolioUrl={profile.portfolioUrl}
            coverLetterTemplate={profile.coverLetterTemplate}
            cvTemplate={profile.cvTemplate}
            onUpdate={updateProfile}
          />
        }
      />
      <Route path="/prep" element={<PrepRoom answers={answers} onUpdateAnswer={updateAnswer} />} />
      <Route
        path="/mock"
        element={
          <PremiumGate title="Mock interview (Premium)">
            <MockTest applications={applications} behavioralAnswers={answers} />
          </PremiumGate>
        }
      />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/admin" element={<AdminUsersPage />} />
    </Routes>
  );
}

function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<ColorMode>(() => loadStoredMode());
  const [palette, setPalette] = useState<ThemePalette>(() => loadStoredPalette());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Theme is a device preference, not account data, so it stays in
  // localStorage. Nothing else does — the application state blob is gone.
  useEffect(() => {
    localStorage.setItem('theme', mode);
    localStorage.setItem('theme_palette', palette);
    applyTheme(palette, mode);
  }, [mode, palette]);

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
    // Signing out unmounts this whole subtree, so a different account never
    // reuses the previous one's loaded data.
    <DataProvider>
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
                <AppRoutes />
              </div>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </DataProvider>
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
