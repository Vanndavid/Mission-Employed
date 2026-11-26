import { useEffect, useState } from 'react';
import { errorMessage, isAbortError } from '../services/http';
import { fetchPracticeAttempts, fetchPracticeProgress } from '../services/practiceHistoryClient';
import { PracticeAttemptSummary, PracticeProgress } from '../types/practiceHistory';

export interface PracticeOverview {
  /** Every mode over the last 30 days, for the coach and weak topics. */
  progress: PracticeProgress | null;
  /** The newest scored attempts, for Recent attempts. */
  attempts: PracticeAttemptSummary[];
  loading: boolean;
  error: string | null;
}

/**
 * What Mission Control's Problems screen shows of the other practice modes,
 * read once when it opens. Either load failing leaves the screen working:
 * the coach says so and Recent attempts shows Problems alone.
 */
export function usePracticeOverview(): PracticeOverview {
  const [overview, setOverview] = useState<PracticeOverview>({ progress: null, attempts: [], loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();

    fetchPracticeProgress(controller.signal)
      .then(progress => setOverview(current => ({ ...current, progress, loading: false })))
      .catch(cause => {
        if (isAbortError(cause)) return;
        setOverview(current => ({ ...current, loading: false, error: errorMessage(cause, 'Could not load your practice progress.') }));
      });

    fetchPracticeAttempts({}, controller.signal)
      .then(page => setOverview(current => ({ ...current, attempts: page.attempts })))
      .catch(() => {
        // Recent attempts still has Problems' own.
      });

    return () => controller.abort();
  }, []);

  return overview;
}
