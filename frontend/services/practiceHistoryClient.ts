/**
 * Practice progress and history across the modes. Flat responses, no
 * `data` envelope. These are reads of the user's own attempts: no plan
 * feature, so no plan refusal comes back from them.
 */

import { PracticeKind } from '../types/practice';
import { PracticeAttemptDetail, PracticeAttemptPage, PracticeProgress } from '../types/practiceHistory';
import { apiRequest } from './http';

/** Every mode over the last 30 days, and each area's latest results for the coach. */
export async function fetchPracticeProgress(signal?: AbortSignal): Promise<PracticeProgress> {
  return apiRequest<PracticeProgress>('/practice/progress', { signal });
}

/** Newest first, twenty a page. No kind is every mode. */
export async function fetchPracticeAttempts(
  options: { kind?: PracticeKind | null; page?: number } = {},
  signal?: AbortSignal,
): Promise<PracticeAttemptPage> {
  const query = new URLSearchParams();
  if (options.kind) query.set('kind', options.kind);
  if (options.page && options.page > 1) query.set('page', String(options.page));
  const suffix = query.toString() ? `?${query}` : '';
  return apiRequest<PracticeAttemptPage>(`/practice/attempts${suffix}`, { signal });
}

/** One attempt with what its mode's result screen draws. 404 when it is not this user's. */
export async function fetchPracticeAttempt(id: number, signal?: AbortSignal): Promise<PracticeAttemptDetail> {
  return apiRequest<PracticeAttemptDetail>(`/practice/attempts/${id}`, { signal });
}
