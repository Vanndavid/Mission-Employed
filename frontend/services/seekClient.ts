/**
 * Seek job listings, proxied through the Laravel API so the browser never
 * talks to Seek directly. The response is a flat object (not a `{ data }`
 * resource envelope) — same shape as the AI endpoints.
 */

import { apiRequest } from './http';
import {
  DEFAULT_SEEK_KEYWORDS,
  DEFAULT_SEEK_WHERE,
  SeekSearchResult,
} from '../utils/seekJobs';

export type { SeekJob, SeekSearchResult } from '../utils/seekJobs';

export interface SeekSearchParams {
  keywords?: string;
  where?: string;
  page?: number;
  pageSize?: number;
  sort?: 'ListedDate' | 'KeywordRelevance';
}

export async function searchSeekJobs(
  params: SeekSearchParams = {},
  signal?: AbortSignal,
): Promise<SeekSearchResult> {
  const query = new URLSearchParams();
  const keywords = params.keywords?.trim() || DEFAULT_SEEK_KEYWORDS;
  const where = params.where?.trim() || DEFAULT_SEEK_WHERE;

  query.set('keywords', keywords);
  query.set('where', where);
  query.set('page', String(params.page && params.page > 0 ? params.page : 1));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.sort) query.set('sort', params.sort);

  return apiRequest<SeekSearchResult>(`/seek/jobs?${query}`, { signal });
}
