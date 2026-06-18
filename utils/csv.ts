import { JobApplication, JobStatus } from '../types';

const HEADERS = [
  'company', 'role', 'location', 'url', 'status', 'dateApplied',
  'criteriaScore', 'criteriaMet', 'notes', 'jobDescription', 'coverLetter',
] as const;

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function exportApplicationsCsv(applications: JobApplication[]): string {
  const rows = [HEADERS.join(',')];
  for (const app of applications) {
    rows.push([
      escapeCsv(app.company),
      escapeCsv(app.role),
      escapeCsv(app.location ?? ''),
      escapeCsv(app.url),
      escapeCsv(app.status),
      escapeCsv(app.dateApplied),
      String(app.criteriaScore),
      escapeCsv((app.criteriaMet ?? []).join(';')),
      escapeCsv(app.notes),
      escapeCsv(app.jobDescription),
      escapeCsv(app.coverLetter),
    ].join(','));
  }
  return rows.join('\n');
}

export function importApplicationsCsv(csv: string): Partial<JobApplication>[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const apps: Partial<JobApplication>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const status = Object.values(JobStatus).includes(row.status as JobStatus)
      ? (row.status as JobStatus)
      : JobStatus.APPLIED;

    apps.push({
      company: row.company || 'Unknown',
      role: row.role || 'Software Engineer',
      location: row.location || '',
      url: row.url || '',
      status,
      dateApplied: row.dateapplied || row.dateApplied || new Date().toISOString(),
      criteriaScore: parseInt(row.criteriascore || row.criteriaScore || '0', 10) || 0,
      criteriaMet: (row.criteriamet || row.criteriaMet || '').split(';').filter(Boolean),
      notes: row.notes || '',
      jobDescription: row.jobdescription || row.jobDescription || row.notes || '',
      coverLetter: row.coverletter || row.coverLetter || '',
    });
  }
  return apps;
}
