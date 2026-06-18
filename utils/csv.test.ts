import { describe, it, expect } from 'vitest';
import { exportApplicationsCsv, importApplicationsCsv } from './csv';
import { JobApplication, JobStatus } from '../types';

const sampleApp: JobApplication = {
  id: '1',
  company: 'Acme Corp',
  role: 'Backend Engineer',
  location: 'Sydney',
  url: 'https://example.com',
  dateApplied: '2025-06-01T00:00:00.000Z',
  status: JobStatus.APPLIED,
  criteriaScore: 5,
  criteriaMet: ['sql'],
  notes: 'Good fit',
  jobDescription: 'JD text',
  coverLetter: 'Dear hiring manager',
  interviewStages: [],
  nextAction: '',
  nextActionDue: '',
  recruiterContact: null,
  takeHome: null,
  offer: null,
};

describe('csv', () => {
  it('exports and re-imports applications', () => {
    const csv = exportApplicationsCsv([sampleApp]);
    expect(csv).toContain('Acme Corp');
    const imported = importApplicationsCsv(csv);
    expect(imported).toHaveLength(1);
    expect(imported[0].company).toBe('Acme Corp');
    expect(imported[0].role).toBe('Backend Engineer');
    expect(imported[0].criteriaScore).toBe(5);
  });
});
