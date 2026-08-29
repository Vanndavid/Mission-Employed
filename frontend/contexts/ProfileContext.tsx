import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { fetchProfile, saveProfile } from '../services/trackerClient';
import { errorMessage, isAbortError } from '../services/http';
import { useDebouncedQueue } from '../hooks/useDebouncedQueue';

/**
 * The user's base CV, cover letter and tailoring templates — one row per
 * account, created at registration, so there is no id and no create path.
 *
 * The profile screen is all free-text areas edited a character at a time, so
 * writes are coalesced the same way application edits are.
 */
export interface ProfileContextValue {
  profile: UserProfile;
  loading: boolean;
  error: string | null;
  saving: boolean;
  reload: () => Promise<void>;
  updateProfile: (partial: Partial<UserProfile>) => void;
}

const EMPTY_PROFILE: UserProfile = {
  baseCV: '',
  cvFileName: '',
  baseCoverLetter: '',
  portfolioUrl: '',
  coverLetterTemplate: '',
  cvTemplate: '',
};

/** One queue key: there is only ever one profile. */
const PROFILE_KEY = 'profile';

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setProfile(await fetchProfile(signal));
      setError(null);
    } catch (cause) {
      if (isAbortError(cause)) return;
      setError(errorMessage(cause, 'Could not load your profile.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const { enqueue, pending } = useDebouncedQueue<Partial<UserProfile>>(
    useCallback(async (_key, patch) => {
      try {
        // The response is the whole profile, so a concurrent edit elsewhere
        // shows up here rather than being silently overwritten.
        setProfile(await saveProfile(patch));
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause, 'Could not save your profile.'));
      }
    }, []),
  );

  const updateProfile = useCallback(
    (partial: Partial<UserProfile>) => {
      setProfile(prev => ({ ...prev, ...partial }));
      enqueue(PROFILE_KEY, partial);
    },
    [enqueue],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        saving: pending,
        reload: () => load(),
        updateProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
