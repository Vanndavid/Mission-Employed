import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from '../types';
import { getTasksForPersona } from '../constants';
import { calculateStreak } from '../utils';
import { buildTalentMetrics } from '../utils/talentMetrics';
import { TalentMetrics } from '../types/talent';
import { useAuth } from '../contexts/AuthContext';
import { putTalentSnapshot } from '../services/authClient';

export type TalentSyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

export function useTalentSync(state: AppState) {
  const { user } = useAuth();
  const [status, setStatus] = useState<TalentSyncStatus>('idle');
  const lastSent = useRef<string>('');

  const dailyTasks = useMemo(
    () => getTasksForPersona(state.huntPersona),
    [state.huntPersona]
  );
  const streakDays = useMemo(
    () => calculateStreak(state.dailyLogs, dailyTasks),
    [state.dailyLogs, dailyTasks]
  );
  const metrics: TalentMetrics = useMemo(
    () => buildTalentMetrics(state, dailyTasks, streakDays),
    [state, dailyTasks, streakDays]
  );

  useEffect(() => {
    if (!user) return;
    const payload = JSON.stringify(metrics);
    if (payload === lastSent.current) {
      setStatus(prev => (prev === 'idle' ? 'ok' : prev));
      return;
    }

    setStatus('syncing');
    const timer = window.setTimeout(() => {
      void putTalentSnapshot(metrics)
        .then(() => {
          lastSent.current = payload;
          setStatus('ok');
        })
        .catch(() => setStatus('error'));
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [user, metrics]);

  return { metrics, status };
}
