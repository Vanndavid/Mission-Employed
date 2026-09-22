/**
 * The tracker endpoints: applications, interview stages, the CV profile,
 * coding history and behavioral answers.
 *
 * Every response here is wrapped in Laravel's `{ data: ... }` resource
 * envelope, so these go through {@link apiResource} rather than
 * {@link apiRequest}. Auth and AI endpoints are flat and do not.
 *
 * Nothing in this file holds state. The contexts under `contexts/` own that;
 * this is only the wire format.
 */

import {
  ApplicationInput,
  BehavioralAnswer,
  CodingHistoryEntry,
  InterviewStage,
  JobApplication,
  NewCodingAttempt,
  NewInterviewStage,
  UserProfile,
} from '../types';
import { apiRequest, apiResource } from './http';

/**
 * Client field names the API accepts on an application. `id`,
 * `interviewStages` and `statusHistory` are server-owned; sending them is
 * harmless but pointless, so they are dropped.
 */
const APPLICATION_FIELDS = [
  'company',
  'role',
  'location',
  'url',
  'status',
  'isImportant',
  'dateApplied',
  'notes',
  'jobDescription',
  'coverLetter',
  'tailoredCV',
  'nextAction',
  'nextActionDue',
  'recruiterContact',
  'takeHome',
  'offer',
] as const;

/** Date inputs the API stores in a real date column, where '' is not a date. */
const DATE_FIELDS: ReadonlySet<string> = new Set(['dateApplied', 'nextActionDue']);

/**
 * Narrow a client-side application object down to what the API accepts.
 *
 * An untouched date input is `''` in the DOM but the column is a nullable
 * date, so blanks are sent as an explicit `null`. Keys the caller did not
 * supply stay absent, which is what makes PATCH partial.
 */
export function toApplicationPayload(input: ApplicationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of APPLICATION_FIELDS) {
    if (!(field in input)) continue;

    const value = (input as Record<string, unknown>)[field];

    if (DATE_FIELDS.has(field) && typeof value === 'string' && value.trim() === '') {
      payload[field] = null;
      continue;
    }

    payload[field] = value;
  }

  return payload;
}

export function toStagePayload(stage: NewInterviewStage): Record<string, unknown> {
  return {
    type: stage.type,
    scheduledAt: stage.scheduledAt?.trim() ? stage.scheduledAt : null,
    notes: stage.notes ?? '',
  };
}

// --- Applications ---------------------------------------------------------

export async function listApplications(signal?: AbortSignal): Promise<JobApplication[]> {
  return (await apiResource<JobApplication[]>('/applications', { signal })) ?? [];
}

export async function createApplication(input: ApplicationInput): Promise<JobApplication> {
  return apiResource<JobApplication>('/applications', {
    method: 'POST',
    body: toApplicationPayload(input),
  });
}

export async function updateApplication(
  id: number,
  input: ApplicationInput,
): Promise<JobApplication> {
  return apiResource<JobApplication>(`/applications/${id}`, {
    method: 'PATCH',
    body: toApplicationPayload(input),
  });
}

export async function deleteApplication(id: number): Promise<void> {
  await apiRequest<void>(`/applications/${id}`, { method: 'DELETE' });
}

// --- Interview stages -----------------------------------------------------

export async function createInterviewStage(
  applicationId: number,
  stage: NewInterviewStage,
): Promise<InterviewStage> {
  return apiResource<InterviewStage>(`/applications/${applicationId}/stages`, {
    method: 'POST',
    body: toStagePayload(stage),
  });
}

export async function deleteInterviewStage(
  applicationId: number,
  stageId: number,
): Promise<void> {
  await apiRequest<void>(`/applications/${applicationId}/stages/${stageId}`, {
    method: 'DELETE',
  });
}

// --- Profile --------------------------------------------------------------

export async function fetchProfile(signal?: AbortSignal): Promise<UserProfile> {
  return apiResource<UserProfile>('/profile', { signal });
}

export async function saveProfile(partial: Partial<UserProfile>): Promise<UserProfile> {
  return apiResource<UserProfile>('/profile', { method: 'PUT', body: partial });
}

// --- Coding history -------------------------------------------------------

export async function listCodingAttempts(signal?: AbortSignal): Promise<CodingHistoryEntry[]> {
  return (await apiResource<CodingHistoryEntry[]>('/coding/attempts', { signal })) ?? [];
}

export async function createCodingAttempt(
  attempt: NewCodingAttempt,
): Promise<CodingHistoryEntry> {
  return apiResource<CodingHistoryEntry>('/coding/attempts', {
    method: 'POST',
    body: {
      title: attempt.title,
      difficulty: attempt.difficulty,
      topics: attempt.topics ?? [],
      completed: attempt.completed,
      date: attempt.date?.trim() ? attempt.date : null,
    },
  });
}

// --- Behavioral answers ---------------------------------------------------

export async function listBehavioralAnswers(signal?: AbortSignal): Promise<BehavioralAnswer[]> {
  return (await apiResource<BehavioralAnswer[]>('/behavioral-answers', { signal })) ?? [];
}

/**
 * Save one theme's bullets. 201 on the first save and 200 on an edit — both
 * are success, and both come back through the same resource.
 *
 * Blank bullets are stripped before sending: `ConvertEmptyStringsToNull` is
 * global middleware on the API, so an `''` element would arrive as `null` and
 * fail the `bullets.*` string rule with a 422.
 */
export async function saveBehavioralAnswer(
  themeId: string,
  bullets: string[],
): Promise<BehavioralAnswer> {
  return apiResource<BehavioralAnswer>(`/behavioral-answers/${themeId}`, {
    method: 'PUT',
    body: { bullets: bullets.map(b => b.trim()).filter(Boolean) },
  });
}
