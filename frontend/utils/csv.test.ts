import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { exportApplicationsCsv } from './csv';
import { guessPlan } from './importPlan';
import { gridsFromWorkbook } from './spreadsheet';
import { JobApplication, JobStatus } from '../types';

const sampleApp: JobApplication = {
  id: 1,
  company: 'Acme Corp',
  role: 'Backend Engineer',
  location: 'Sydney',
  source: 'Seek',
  url: 'https://example.com',
  dateApplied: '2025-06-01',
  status: JobStatus.APPLIED,
  isImportant: true,
  notes: 'Good fit',
  jobDescription: 'JD text',
  coverLetter: 'Dear hiring manager',
  tailoredCV: 'Tailored CV text',
  interviewStages: [],
  nextAction: '',
  nextActionDue: '',
  recruiterContact: null,
  takeHome: null,
  offer: null,
};

/** Read an exported CSV back the way the importer would. */
function reread(csv: string) {
  const { sheets } = gridsFromWorkbook(XLSX, new TextEncoder().encode(csv));

  return sheets[0];
}

describe('csv', () => {
  it('exports every column the tracker holds', () => {
    const csv = exportApplicationsCsv([sampleApp]);

    expect(csv).toContain('Acme Corp');
    expect(csv).toContain('Seek');
    expect(reread(csv).headers).toEqual([
      'company', 'role', 'location', 'url', 'source', 'status', 'isImportant',
      'dateApplied', 'notes', 'jobDescription', 'coverLetter', 'tailoredCV',
    ]);
  });

  it('is read back by the importer without any help from a model', () => {
    // Our own export is the easiest case the importer has to handle, so it is
    // worth proving the two still line up.
    const sheet = reread(exportApplicationsCsv([sampleApp]));
    const { columns } = guessPlan(sheet);

    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0][columns.company]).toBe('Acme Corp');
    expect(sheet.rows[0][columns.role]).toBe('Backend Engineer');
    expect(sheet.rows[0][columns.source]).toBe('Seek');
    expect(sheet.rows[0][columns.status]).toBe('Applied');
    expect(sheet.rows[0][columns.dateApplied]).toBe('2025-06-01');
  });

  it('quotes a cell containing a comma so it survives the round trip', () => {
    const csv = exportApplicationsCsv([{
      ...sampleApp,
      notes: '3rd application (Apr, Jul, Sep)',
    }]);

    const sheet = reread(csv);
    const { columns } = guessPlan(sheet);

    expect(sheet.rows[0][columns.notes]).toBe('3rd application (Apr, Jul, Sep)');
  });

  it('quotes a cell containing a newline so it survives the round trip', () => {
    // The export always escaped these; the old reader could not read them back.
    const csv = exportApplicationsCsv([{
      ...sampleApp,
      notes: 'first line\nsecond line',
    }]);

    const sheet = reread(csv);
    const { columns } = guessPlan(sheet);

    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0][columns.notes]).toBe('first line\nsecond line');
  });
});
