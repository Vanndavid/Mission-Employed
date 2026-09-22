import { ApplicationInput, JobApplication, JobStatus } from '../types';

const HEADERS = [
  'company', 'role', 'location', 'url', 'status', 'isImportant', 'dateApplied',
  'notes', 'jobDescription', 'coverLetter', 'tailoredCV',
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

/**
 * A date cell as the API wants it: 'YYYY-MM-DD', or '' when the column was
 * blank or unparseable.
 *
 * `''` matters — {@link toApplicationPayload} turns a blank date into an
 * explicit `null` rather than letting `''` reach a nullable date column, and
 * the applications context fills in today's date on create. Inventing a full
 * ISO timestamp here would defeat both.
 */
function toDateOnly(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/**
 * Parse a CSV export back into create payloads.
 *
 * These are {@link ApplicationInput}s, not applications: no `id`, because the
 * server assigns one per row. The caller POSTs each of them.
 */
export function importApplicationsCsv(csv: string): ApplicationInput[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const apps: ApplicationInput[] = [];

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
      // Anything but an explicit truthy cell means "not starred", so a file
      // exported before this column existed imports as unstarred.
      isImportant: ['true', '1', 'yes'].includes((row.isimportant ?? '').trim().toLowerCase()),
      dateApplied: toDateOnly(row.dateapplied ?? ''),
      notes: row.notes || '',
      jobDescription: row.jobdescription || row.notes || '',
      coverLetter: row.coverletter || '',
      tailoredCV: row.tailoredcv || '',
    });
  }
  return apps;
}
