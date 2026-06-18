import { describe, it, expect } from 'vitest';
import { computeFollowUpReminders } from './followUps';
import { JobApplication, JobStatus } from '../types';

describe('followUps', () => {
  it('flags applied applications older than 7 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const apps: JobApplication[] = [{
      id: '1',
      company: 'Acme',
      role: 'Engineer',
      url: '',
      dateApplied: old.toISOString(),
      status: JobStatus.APPLIED,
      criteriaScore: 4,
      criteriaMet: [],
      notes: '',
      jobDescription: '',
      coverLetter: '',
      interviewStages: [],
      nextAction: '',
      nextActionDue: '',
      recruiterContact: null,
      takeHome: null,
      offer: null,
      statusHistory: [{ status: JobStatus.APPLIED, date: old.toISOString() }],
    }];
    const reminders = computeFollowUpReminders(apps, 7);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].company).toBe('Acme');
    expect(reminders[0].daysSinceApplied).toBeGreaterThanOrEqual(7);
  });

  it('ignores non-applied statuses', () => {
    const apps: JobApplication[] = [{
      id: '1',
      company: 'Acme',
      role: 'Engineer',
      url: '',
      dateApplied: '2020-01-01',
      status: JobStatus.INTERVIEWING,
      criteriaScore: 4,
      criteriaMet: [],
      notes: '',
      jobDescription: '',
      coverLetter: '',
      interviewStages: [],
      nextAction: '',
      nextActionDue: '',
      recruiterContact: null,
      takeHome: null,
      offer: null,
    }];
    expect(computeFollowUpReminders(apps)).toHaveLength(0);
  });
});
