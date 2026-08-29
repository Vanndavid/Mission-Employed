import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CodingHistoryEntry, NewCodingAttempt } from '../types';
import { createCodingAttempt, listCodingAttempts } from '../services/trackerClient';
import { errorMessage, isAbortError } from '../services/http';

/**
 * Coding practice history: the list the dashboard charts weak topics from, and
 * the row a finished attempt appends.
 *
 * Append-only — there is no update or delete route, because an attempt is a
 * record of something that happened.
 */
export interface CodingHistoryContextValue {
  codingHistory: CodingHistoryEntry[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  reload: () => Promise<void>;
  addAttempt: (attempt: NewCodingAttempt) => Promise<CodingHistoryEntry | null>;
}

const CodingHistoryContext = createContext<CodingHistoryContextValue | null>(null);

export function CodingHistoryProvider({ children }: { children: React.ReactNode }) {
  const [codingHistory, setCodingHistory] = useState<CodingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setCodingHistory(await listCodingAttempts(signal));
      setError(null);
    } catch (cause) {
      if (isAbortError(cause)) return;
      setError(errorMessage(cause, 'Could not load your coding history.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const addAttempt = useCallback(async (attempt: NewCodingAttempt) => {
    setSaving(true);
    try {
      // The list is newest first, matching the API's ordering.
      const created = await createCodingAttempt(attempt);
      setCodingHistory(prev => [created, ...prev]);
      setError(null);
      return created;
    } catch (cause) {
      setError(errorMessage(cause, 'Could not record that attempt.'));
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <CodingHistoryContext.Provider
      value={{ codingHistory, loading, error, saving, reload: () => load(), addAttempt }}
    >
      {children}
    </CodingHistoryContext.Provider>
  );
}

export function useCodingHistory(): CodingHistoryContextValue {
  const ctx = useContext(CodingHistoryContext);
  if (!ctx) throw new Error('useCodingHistory must be used within CodingHistoryProvider');
  return ctx;
}
