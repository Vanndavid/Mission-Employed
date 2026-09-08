import { describe, expect, it } from 'vitest';
import { JobStatus } from '../types';
import {
  isSeekJobTracked,
  seekJobDescription,
  seekJobToApplication,
  tracksSeekJob,
  SeekJob,
} from './seekJobs';

const JOB: SeekJob = {
  id: '94488368',
  title: 'Software Engineer',
  company: 'Energetica',
  location: 'Melbourne VIC',
  url: 'https://www.seek.com.au/job/94488368',
  salary: '$105,000 – $135,000 per year',
  teaser: 'End-to-end software platform.',
  bulletPoints: ['career development', 'hybrid'],
  workTypes: ['Full time'],
  workArrangement: 'Hybrid',
  listedAt: '2026-09-08T05:10:53Z',
  listedAgo: '7h ago',
  classification: 'Information & Communication Technology',
  subclassification: 'Engineering - Software',
};

describe('tracksSeekJob', () => {
  it('matches the canonical Seek job URL', () => {
    expect(tracksSeekJob('https://www.seek.com.au/job/94488368', '94488368')).toBe(true);
  });

  it('matches the slug form and a trailing query string', () => {
    expect(
      tracksSeekJob('https://www.seek.com.au/job/94488368/software-engineer-melbourne?ref=search', '94488368'),
    ).toBe(true);
  });

  it('does not treat a shorter id as a prefix of a longer one', () => {
    expect(tracksSeekJob('https://www.seek.com.au/job/94488368', '9448')).toBe(false);
    expect(tracksSeekJob('https://www.seek.com.au/job/94', '94488368')).toBe(false);
  });

  it('ignores blank urls', () => {
    expect(tracksSeekJob('', '94488368')).toBe(false);
  });
});

describe('isSeekJobTracked', () => {
  it('recognises a listing already in the tracker', () => {
    expect(isSeekJobTracked(JOB, ['https://example.com/x', JOB.url])).toBe(true);
    expect(isSeekJobTracked(JOB, ['https://example.com/x'])).toBe(false);
  });
});

describe('seekJobToApplication', () => {
  it('saves the listing as a Saved application with the Seek URL', () => {
    const input = seekJobToApplication(JOB);

    expect(input.company).toBe('Energetica');
    expect(input.role).toBe('Software Engineer');
    expect(input.location).toBe('Melbourne VIC');
    expect(input.url).toBe(JOB.url);
    expect(input.status).toBe(JobStatus.SAVED);
    expect(input.jobDescription).toBe(seekJobDescription(JOB));
    expect(input.notes).toContain('End-to-end software platform.');
    expect(input.notes).toContain('• career development');
    expect(input.notes).toContain('Salary: $105,000 – $135,000 per year');
    expect(input.notes).toContain('Full time · Hybrid');
  });
});
