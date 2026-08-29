import React from 'react';
import { ApplicationsProvider } from './ApplicationsContext';
import { BehavioralAnswersProvider } from './BehavioralAnswersContext';
import { CodingHistoryProvider } from './CodingHistoryContext';
import { ProfileProvider } from './ProfileContext';

/**
 * Every server-owned resource, in one place.
 *
 * Mounted inside the signed-in branch of the app, so each provider's initial
 * load runs with a token in hand and the whole tree is torn down on logout —
 * one user's data can never be left on screen for the next one.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <ApplicationsProvider>
        <CodingHistoryProvider>
          <BehavioralAnswersProvider>{children}</BehavioralAnswersProvider>
        </CodingHistoryProvider>
      </ApplicationsProvider>
    </ProfileProvider>
  );
}

export { useApplications } from './ApplicationsContext';
export { useBehavioralAnswers } from './BehavioralAnswersContext';
export { useCodingHistory } from './CodingHistoryContext';
export { useProfile } from './ProfileContext';
