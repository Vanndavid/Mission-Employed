/**
 * System design practice. Flat responses, no `data` envelope.
 *
 * Both routes are behind the `system_design` plan feature, so either can
 * come back as a plan refusal (ApiError.isPlanRefusal); scoring an answer is
 * one use and can also fail with 502 `ai_unavailable`.
 */

import { PracticeDifficulty } from '../types/practice';
import { SystemDesignNext, SystemDesignReport, SystemDesignSections } from '../types/systemDesign';
import { apiRequest } from './http';

/**
 * The scenario to answer next and the rubric. `skip` is the scenario on
 * screen, passed over when there is another.
 */
export async function fetchNextScenario(
  options: { difficulty?: PracticeDifficulty | null; skip?: number | null } = {},
  signal?: AbortSignal,
): Promise<SystemDesignNext> {
  const query = new URLSearchParams();
  if (options.difficulty) query.set('difficulty', options.difficulty);
  if (options.skip) query.set('skip', String(options.skip));
  const suffix = query.toString() ? `?${query}` : '';

  return apiRequest<SystemDesignNext>(`/practice/system-design/next${suffix}`, { signal });
}

/** Score an answer on the server, which stores it. 404 when the scenario is no longer published. */
export async function submitSystemDesign(questionId: number, sections: SystemDesignSections): Promise<SystemDesignReport> {
  return apiRequest<SystemDesignReport>(`/practice/system-design/${questionId}/answers`, {
    method: 'POST',
    body: { sections },
  });
}
