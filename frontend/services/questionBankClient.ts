/**
 * The practice question bank: the admin's review flow, and a user reporting
 * a question. Flat responses, no `data` envelope.
 *
 * The admin routes name no plan feature, so no plan refusal comes back from
 * them; a non-admin gets 403 `admin_required`. Generating can fail with 502
 * `ai_unavailable`, with nothing saved.
 */

import {
  AdminQuestion,
  DeleteQuestionResult,
  GenerateDraftsInput,
  GenerateDraftsResult,
  QuestionBankPage,
  QuestionFilters,
  QuestionPatch,
} from '../types/questionBank';
import { apiRequest } from './http';

const BASE = '/admin/practice/questions';

/** The query string for a page of the list; empty filters are left out. */
export function questionQuery(filters: QuestionFilters, page = 1): string {
  const params = new URLSearchParams();
  for (const key of ['kind', 'status', 'language', 'topic', 'source'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (filters.reported) params.set('reported', '1');
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchQuestionBank(filters: QuestionFilters, page = 1, signal?: AbortSignal): Promise<QuestionBankPage> {
  return apiRequest<QuestionBankPage>(`${BASE}${questionQuery(filters, page)}`, { signal });
}

/** One model call; the valid drafts are saved, the rest come back with reasons. */
export async function generateDrafts(input: GenerateDraftsInput): Promise<GenerateDraftsResult> {
  return apiRequest<GenerateDraftsResult>(`${BASE}/generate`, { method: 'POST', body: input });
}

/** 422 with field errors when the edited question fails its checks, or on a seed row. */
export async function updateQuestion(id: number, patch: QuestionPatch): Promise<AdminQuestion> {
  const { question } = await apiRequest<{ question: AdminQuestion }>(`${BASE}/${id}`, { method: 'PATCH', body: patch });
  return question;
}

export async function deleteQuestion(id: number): Promise<DeleteQuestionResult> {
  return apiRequest<DeleteQuestionResult>(`${BASE}/${id}`, { method: 'DELETE' });
}

export async function resolveReports(id: number): Promise<AdminQuestion> {
  const { question } = await apiRequest<{ question: AdminQuestion }>(`${BASE}/${id}/reports/resolve`, { method: 'POST' });
  return question;
}

/**
 * A user reporting a published question. 409 `already_reported` while their
 * earlier report is open; 404 when it is no longer published.
 */
export async function reportQuestion(id: number, reason: string): Promise<void> {
  await apiRequest<{ reported: boolean }>(`/practice/questions/${id}/report`, { method: 'POST', body: { reason } });
}
