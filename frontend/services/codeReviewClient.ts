/**
 * Code review practice. Flat responses, no `data` envelope.
 *
 * Every route is the `code_review` plan feature: a plan refusal (403/429)
 * can come back from any of them, and only a scored review counts as a use.
 */

import { CodeReviewResult, NextSnippetFilter, NextSnippetResponse, ReviewComment } from '../types/codeReview';
import { apiRequest } from './http';

/** A snippet to review, preferring ones this user has not reviewed. */
export async function fetchNextSnippet(filter: NextSnippetFilter = {}, signal?: AbortSignal): Promise<NextSnippetResponse> {
  const params = new URLSearchParams();
  if (filter.language) params.set('language', filter.language);
  if (filter.difficulty) params.set('difficulty', filter.difficulty);
  if (filter.exclude) params.set('exclude', String(filter.exclude));
  if (filter.category) params.set('category', filter.category);
  const query = params.toString();
  return apiRequest<NextSnippetResponse>(`/practice/code-review/next${query ? `?${query}` : ''}`, { signal });
}

/**
 * Score a review on the server, which stores it and reveals the planted
 * issues. 404 when the snippet is no longer published.
 */
export async function submitCodeReview(snippetId: number, comments: ReviewComment[], summary: string): Promise<CodeReviewResult> {
  const body: { comments: ReviewComment[]; summary?: string } = { comments };
  if (summary.trim()) body.summary = summary.trim();
  return apiRequest<CodeReviewResult>(`/practice/code-review/${snippetId}/reviews`, { method: 'POST', body });
}

/** A review stored earlier, as it was scored. */
export async function fetchCodeReview(attemptId: number, signal?: AbortSignal): Promise<CodeReviewResult> {
  return apiRequest<CodeReviewResult>(`/practice/code-review/reviews/${attemptId}`, { signal });
}
