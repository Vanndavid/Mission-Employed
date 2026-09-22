import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ApplicationInput,
  InterviewStage,
  JobApplication,
  JobStatus,
  NewInterviewStage,
} from '../types';
import * as tracker from '../services/trackerClient';
import { ApiError, errorMessage, isAbortError } from '../services/http';
import { RowPlan, RowVerdict } from '../utils/importMerge';
import { useDebouncedQueue } from '../hooks/useDebouncedQueue';

/**
 * The job application list, owned by the server.
 *
 * Two rules this context exists to enforce:
 *
 * 1. **The server assigns ids.** Applications and stages used to be created
 *    locally with `crypto.randomUUID()`; now nothing enters the list that the
 *    API has not answered with, so a record's id is always a real row.
 * 2. **Field edits are coalesced.** The prep drawer calls `updateApplication`
 *    on every keystroke. Patches for one application are merged and sent once
 *    typing pauses, so a note is one PATCH rather than forty.
 */
export interface ApplicationsContextValue {
  applications: JobApplication[];
  /** True while the initial list is loading. */
  loading: boolean;
  /** The last read or write failure, or null. */
  error: string | null;
  /** True while any edit is queued or in flight. */
  saving: boolean;
  reload: () => Promise<void>;
  addApplication: (input: ApplicationInput) => Promise<JobApplication | null>;
  updateApplication: (id: number, partial: ApplicationInput) => void;
  updateStatus: (id: number, status: JobStatus) => Promise<void>;
  deleteApplication: (id: number) => Promise<void>;
  addInterviewStage: (applicationId: number, stage: NewInterviewStage) => Promise<InterviewStage | null>;
  removeInterviewStage: (applicationId: number, stageId: number) => Promise<void>;
  /**
   * Commit a reviewed spreadsheet import, one request per row, and report what
   * happened to each. Replaces the old blind bulk create: rows that matched
   * something already tracked are patched rather than duplicated, and a row
   * that fails says why instead of being counted and forgotten.
   */
  commitImport: (plans: RowPlan[]) => Promise<ImportOutcome[]>;
}

/** What happened to one row of a committed import. */
export interface ImportOutcome {
  rowNumber: number;
  verdict: RowVerdict;
  status: 'created' | 'filled' | 'skipped' | 'failed';
  applicationId: number | null;
  /** Why it failed or was skipped. '' when it simply worked. */
  message: string;
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

/** A new application the client did not fill in completely. */
function withCreateDefaults(input: ApplicationInput): ApplicationInput {
  const today = new Date().toISOString().slice(0, 10);

  return {
    ...input,
    company: input.company || 'Unknown',
    role: input.role || 'Software Engineer',
    status: input.status ?? JobStatus.APPLIED,
    dateApplied: input.dateApplied || today,
    jobDescription: input.jobDescription ?? input.notes ?? '',
  };
}

export function ApplicationsProvider({ children }: { children: React.ReactNode }) {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const replace = useCallback((saved: JobApplication) => {
    setApplications(prev => prev.map(app => (app.id === saved.id ? saved : app)));
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const list = await tracker.listApplications(signal);
      setApplications(list);
      setError(null);
    } catch (cause) {
      if (isAbortError(cause)) return;
      setError(errorMessage(cause, 'Could not load your applications.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reload = useCallback(() => load(), [load]);

  const { enqueue, flushNow, pending } = useDebouncedQueue<ApplicationInput>(
    useCallback(
      async (key, patch) => {
        try {
          replace(await tracker.updateApplication(Number(key), patch));
          setError(null);
        } catch (cause) {
          // The optimistic copy is now a guess; take the server's word for it.
          // Reload first, then report — a successful load clears the error,
          // and the rejection is the thing the user has to see.
          await load();
          setError(errorMessage(cause, 'Could not save that change.'));
        }
      },
      [replace, load],
    ),
  );

  const updateApplication = useCallback(
    (id: number, partial: ApplicationInput) => {
      setApplications(prev => prev.map(app => (app.id === id ? { ...app, ...partial } : app)));
      enqueue(String(id), partial);
    },
    [enqueue],
  );

  const addApplication = useCallback(async (input: ApplicationInput) => {
    try {
      const created = await tracker.createApplication(withCreateDefaults(input));
      setApplications(prev => [created, ...prev]);
      setError(null);
      return created;
    } catch (cause) {
      setError(errorMessage(cause, 'Could not add that application.'));
      return null;
    }
  }, []);

  const updateStatus = useCallback(
    async (id: number, status: JobStatus) => {
      // Immediate rather than queued: a status change also appends a row to
      // the server's status event log, which the timeline reads back.
      setApplications(prev => prev.map(app => (app.id === id ? { ...app, status } : app)));
      try {
        replace(await tracker.updateApplication(id, { status }));
        setError(null);
      } catch (cause) {
        await load();
        setError(errorMessage(cause, 'Could not update that status.'));
      }
    },
    [replace, load],
  );

  const deleteApplication = useCallback(
    async (id: number) => {
      try {
        await tracker.deleteApplication(id);
        setApplications(prev => prev.filter(app => app.id !== id));
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause, 'Could not delete that application.'));
      }
    },
    [],
  );

  const addInterviewStage = useCallback(
    async (applicationId: number, stage: NewInterviewStage) => {
      // A queued field edit would overwrite the stage list we are about to
      // splice into, so let it land first.
      await flushNow();

      try {
        const created = await tracker.createInterviewStage(applicationId, stage);

        setApplications(prev =>
          prev.map(app =>
            app.id === applicationId
              ? { ...app, interviewStages: [...(app.interviewStages ?? []), created] }
              : app,
          ),
        );
        setError(null);

        // Scheduling an interview moves an applied record along, the way the
        // local-state version did.
        const current = applications.find(app => app.id === applicationId);
        if (current?.status === JobStatus.APPLIED) {
          replace(await tracker.updateApplication(applicationId, { status: JobStatus.INTERVIEWING }));
        }

        return created;
      } catch (cause) {
        setError(errorMessage(cause, 'Could not add that interview stage.'));
        return null;
      }
    },
    [applications, flushNow, replace],
  );

  const removeInterviewStage = useCallback(
    async (applicationId: number, stageId: number) => {
      try {
        await tracker.deleteInterviewStage(applicationId, stageId);
        setApplications(prev =>
          prev.map(app =>
            app.id === applicationId
              ? {
                  ...app,
                  interviewStages: (app.interviewStages ?? []).filter(s => s.id !== stageId),
                }
              : app,
          ),
        );
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause, 'Could not remove that interview stage.'));
      }
    },
    [],
  );

  const commitImport = useCallback(async (plans: RowPlan[]) => {
    const outcomes: ImportOutcome[] = [];
    const created: JobApplication[] = [];
    const updated = new Map<number, JobApplication>();

    // One request per row, in order: there is no bulk endpoint, and doing them
    // one at a time means a single bad row cannot lose the rest of the file.
    for (const plan of plans) {
      if (plan.verdict === 'identical' || plan.verdict === 'invalid') {
        outcomes.push({
          rowNumber: plan.rowNumber,
          verdict: plan.verdict,
          status: 'skipped',
          applicationId: plan.match?.id ?? null,
          message: plan.reason,
        });
        continue;
      }

      try {
        if (plan.verdict === 'create') {
          // Deliberately not through withCreateDefaults: its invented role and
          // today's date would put values where the sheet had blanks, which is
          // exactly what a later import needs to be able to fill.
          const application = await tracker.createApplication(plan.payload as ApplicationInput);
          created.push(application);

          outcomes.push({
            rowNumber: plan.rowNumber,
            verdict: plan.verdict,
            status: 'created',
            applicationId: application.id,
            message: '',
          });
        } else {
          // The direct client call, not this context's own updateApplication:
          // that one is optimistic and debounced, and a burst of row patches
          // would coalesce and lose writes.
          const application = await tracker.updateApplication(
            plan.match!.id,
            plan.payload as ApplicationInput,
          );
          updated.set(application.id, application);

          outcomes.push({
            rowNumber: plan.rowNumber,
            verdict: plan.verdict,
            status: 'filled',
            applicationId: application.id,
            message: '',
          });
        }
      } catch (cause) {
        // Keep the reason. The old bulk import counted failures and discarded
        // every one of them, which made a bad row impossible to diagnose.
        const fieldError = cause instanceof ApiError && cause.isValidation
          ? cause.firstFieldError()
          : null;

        outcomes.push({
          rowNumber: plan.rowNumber,
          verdict: plan.verdict,
          status: 'failed',
          applicationId: plan.match?.id ?? null,
          message: fieldError ?? errorMessage(cause, 'That row could not be imported.'),
        });
      }
    }

    // One state update for the whole file, so the table renders once.
    if (created.length > 0 || updated.size > 0) {
      setApplications(prev => [
        ...created.slice().reverse(),
        ...prev.map(application => updated.get(application.id) ?? application),
      ]);
    }

    // The importer reports per row; the global banner would only duplicate it.
    setError(null);

    return outcomes;
  }, []);

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        loading,
        error,
        saving: pending,
        reload,
        addApplication,
        updateApplication,
        updateStatus,
        deleteApplication,
        addInterviewStage,
        removeInterviewStage,
        commitImport,
      }}
    >
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications(): ApplicationsContextValue {
  const ctx = useContext(ApplicationsContext);
  if (!ctx) throw new Error('useApplications must be used within ApplicationsProvider');
  return ctx;
}
