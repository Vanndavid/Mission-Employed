/**
 * Exporting the tracker as a CSV.
 *
 * There is no reader here any more. Importing goes through utils/spreadsheet,
 * which reads .xlsx, .xls and .csv through one real parser: the hand-rolled
 * reader this file used to carry split on newlines before parsing quotes, so a
 * quoted notes cell containing a newline corrupted the row it was on.
 */

import { JobApplication } from '../types';

const HEADERS = [
  'company', 'role', 'location', 'url', 'source', 'status', 'isImportant', 'dateApplied',
  'notes', 'jobDescription', 'coverLetter', 'tailoredCV',
] as const;

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportApplicationsCsv(applications: JobApplication[]): string {
  const rows = [HEADERS.join(',')];
  for (const app of applications) {
    rows.push([
      escapeCsv(app.company),
      escapeCsv(app.role),
      escapeCsv(app.location ?? ''),
      escapeCsv(app.url),
      escapeCsv(app.source ?? ''),
      escapeCsv(app.status),
      app.isImportant ? 'true' : 'false',
      escapeCsv(app.dateApplied),
      escapeCsv(app.notes),
      escapeCsv(app.jobDescription),
      escapeCsv(app.coverLetter),
      escapeCsv(app.tailoredCV ?? ''),
    ].join(','));
  }
  return rows.join('\n');
}
