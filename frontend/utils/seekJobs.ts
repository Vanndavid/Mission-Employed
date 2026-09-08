/**
 * Seek listing helpers for the job applications page.
 *
 * The API already maps Seek's jobsearch JSON into {@link SeekJob}; this file
 * is the client-side half — turning a listing into an application, and
 * recognising a tracker URL that already points at that listing.
 */

import { ApplicationInput, JobStatus } from '../types';

export const DEFAULT_SEEK_KEYWORDS = 'software engineer';

export const DEFAULT_SEEK_WHERE = 'All Australia';

export interface SeekJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string;
  teaser: string;
  bulletPoints: string[];
  workTypes: string[];
  workArrangement: string;
  listedAt: string;
  listedAgo: string;
  classification: string;
  subclassification: string;
}

export interface SeekSearchResult {
  jobs: SeekJob[];
  totalCount: number;
  page: number;
  pageSize: number;
  keywords: string;
  where: string;
}

/**
 * True when a saved application already points at this Seek listing.
 *
 * Matches the canonical `/job/{id}` path Seek uses, including the longer
 * slug form (`/job/12345/software-engineer-sydney`) and trailing query
 * strings. A prefix match on the id is not enough — `/job/94` must not
 * collide with `/job/94488368`.
 */
export function tracksSeekJob(url: string, jobId: string): boolean {
  if (!url || !jobId) return false;

  const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|/)job/${escaped}(?:[/?#]|$)`).test(url);
}

export function isSeekJobTracked(job: SeekJob, urls: string[]): boolean {
  return urls.some(url => tracksSeekJob(url, job.id) || url === job.url);
}

/** Notes / job description pasted into a new Saved application. */
export function seekJobDescription(job: SeekJob): string {
  const lines: string[] = [];

  if (job.teaser) lines.push(job.teaser);

  if (job.bulletPoints.length) {
    if (lines.length) lines.push('');
    for (const point of job.bulletPoints) lines.push(`• ${point}`);
  }

  const extras = [
    job.salary ? `Salary: ${job.salary}` : '',
    [...job.workTypes, job.workArrangement].filter(Boolean).join(' · '),
  ].filter(Boolean);

  if (extras.length) {
    if (lines.length) lines.push('');
    lines.push(...extras);
  }

  return lines.join('\n').trim();
}

/** Fields POST /api/applications accepts for a listing the user has not applied to yet. */
export function seekJobToApplication(job: SeekJob): ApplicationInput {
  const description = seekJobDescription(job);

  return {
    company: job.company,
    role: job.title,
    location: job.location,
    url: job.url,
    status: JobStatus.SAVED,
    notes: description,
    jobDescription: description,
  };
}
