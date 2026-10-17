
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar, MobileHeader } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { JobApplications } from './components/JobApplications';
import { PrepRoom } from './components/PrepRoom';
import { MockTest } from './components/MockTest';
import { Profile } from './components/Profile';
import { ToastProvider } from './components/ToastProvider';
import { AuthScreen } from './components/AuthScreen';
import { AccountPage } from './components/AccountPage';
import { AdminUsersPage } from './components/AdminUsersPage';
import { AdminPlansPage } from './components/AdminPlansPage';
import { SettingsPage } from './components/SettingsPage';
import { PremiumGate } from './components/PremiumGate';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  DataProvider,
  useApplications,
  useBehavioralAnswers,
  useCodingHistory,
  useProfile,
} from './contexts/DataProvider';

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
    commitImport,
    checkAtsScore,
    loading: applicationsLoading,
    error: applicationsError,
    reload: reloadApplications,
  } = useApplications();
  const { profile, updateProfile } = useProfile();
  const { codingHistory, addAttempt } = useCodingHistory();
  // The prep room reads and writes this set through the context itself, the
  // way Dashboard does; the two read-only consumers below still take it as a
  // prop.
  const { answers } = useBehavioralAnswers();
  const { user, updatePreferences } = useAuth();

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
          <JobApplications
            applications={applications}
            behavioralAnswers={answers}
            onAdd={addApplication}
            onUpdateStatus={updateStatus}
            onUpdateApplication={updateApplication}
            onAddInterviewStage={addInterviewStage}
            onRemoveInterviewStage={removeInterviewStage}
            onDelete={handleDelete}
            onCommitImport={commitImport}
            onCheckAts={checkAtsScore}
            loading={applicationsLoading}
            loadError={applicationsError}
            onRetry={() => void reloadApplications()}
            baseCV={profile.baseCV}
            coverLetterTemplate={profile.coverLetterTemplate}
            cvTemplate={profile.cvTemplate}
            portfolioUrl={profile.portfolioUrl}
            pageSize={user?.preferences.applicationsPageSize}
            onPageSizeChange={size => updatePreferences({ applicationsPageSize: size })}
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
      <Route path="/prep" element={<PrepRoom />} />
      <Route
        path="/mock"
        element={
          <PremiumGate feature="mock_interview" title="Mock interview (Premium)">
            <MockTest applications={applications} behavioralAnswers={answers} />
          </PremiumGate>
        }
      />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/admin" element={<AdminUsersPage />} />
      <Route path="/account/admin/plans" element={<AdminPlansPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    // reuses the previous one's loaded data or plan.
    <SubscriptionProvider>
      <DataProvider>
        <BrowserRouter>
          <div className="min-h-screen text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
            <Sidebar
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
    </SubscriptionProvider>
  );
}

export default function App() {
  return (
    // Outside the auth gate so the sign-in screen is themed too.
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
