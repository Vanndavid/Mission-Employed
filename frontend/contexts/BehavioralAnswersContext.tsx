import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { listBehavioralAnswers, saveBehavioralAnswer } from '../services/trackerClient';
import { errorMessage, isAbortError } from '../services/http';
import { useDebouncedQueue } from '../hooks/useDebouncedQueue';

/**
 * STAR bullets, per user and global rather than per application — both the
 * prep room and the mock interview read the same set.
 *
 * The API only stores themes that have actually been saved, but every screen
 * expects all six to exist, so the stored rows are merged over a full set of
 * blanks. That keeps the shape the components were written against.
 */
export interface BehavioralAnswersContextValue {
  answers: BehavioralAnswer[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  reload: () => Promise<void>;
  updateAnswer: (themeId: string, bullets: string[]) => void;
}

const BehavioralAnswersContext = createContext<BehavioralAnswersContextValue | null>(null);

/** One empty input per theme, which is what the prep room renders first. */
function blankBullets(): Record<string, string[]> {
  return Object.fromEntries(BEHAVIORAL_THEMES.map(theme => [theme.id, ['']]));
}

export function BehavioralAnswersProvider({ children }: { children: React.ReactNode }) {
  const [bulletsByTheme, setBulletsByTheme] = useState<Record<string, string[]>>(blankBullets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const stored = await listBehavioralAnswers(signal);
      const merged = blankBullets();
      for (const answer of stored) {
        if (answer.bullets?.length) merged[answer.themeId] = answer.bullets;
      }
      setBulletsByTheme(merged);
      setError(null);
    } catch (cause) {
      if (isAbortError(cause)) return;
      setError(errorMessage(cause, 'Could not load your behavioral answers.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const { enqueue, pending } = useDebouncedQueue<{ bullets: string[] }>(
    useCallback(async (themeId, patch) => {
      // Every non-blank bullet gone means there is nothing to send: the API
      // requires a non-empty array, so an all-blank theme is left as it was.
      // See the behavioral-answers note under Open questions in TASKS.md.
      if (!patch.bullets.some(bullet => bullet.trim())) return;

      try {
        await saveBehavioralAnswer(themeId, patch.bullets);
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause, 'Could not save those bullets.'));
      }
    }, []),
  );

  const updateAnswer = useCallback(
    (themeId: string, bullets: string[]) => {
      // The local copy keeps blank rows so the inputs the user is typing into
      // stay on screen; only non-blank bullets are ever sent.
      setBulletsByTheme(prev => ({ ...prev, [themeId]: bullets }));
      enqueue(themeId, { bullets });
    },
    [enqueue],
  );

  const answers = useMemo<BehavioralAnswer[]>(
    () =>
      BEHAVIORAL_THEMES.map(theme => ({
        themeId: theme.id,
        bullets: bulletsByTheme[theme.id] ?? [''],
      })),
    [bulletsByTheme],
  );

  return (
    <BehavioralAnswersContext.Provider
      value={{
        answers,
        loading,
        error,
        saving: pending,
        reload: () => load(),
        updateAnswer,
      }}
    >
      {children}
    </BehavioralAnswersContext.Provider>
  );
}

export function useBehavioralAnswers(): BehavioralAnswersContextValue {
  const ctx = useContext(BehavioralAnswersContext);
  if (!ctx) throw new Error('useBehavioralAnswers must be used within BehavioralAnswersProvider');
  return ctx;
}
