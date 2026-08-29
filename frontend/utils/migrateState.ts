
import { AppState, JobApplication } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';

export const CURRENT_SCHEMA = 4;

/** Keys that older saved states carried but the app no longer models. */
const REMOVED_KEYS = [
  'dailyLogs',
  'customCriteria',
  'targetScore',
  'huntPersona',
  'contacts',
] as const;

const REMOVED_APPLICATION_KEYS = ['criteriaScore', 'criteriaMet'] as const;

function migrateApplication(app: Partial<JobApplication>): JobApplication {
  const migrated: JobApplication = {
    id: app.id ?? crypto.randomUUID(),
    company: app.company ?? 'Unknown',
    role: app.role ?? 'Software Engineer',
    location: app.location ?? '',
    url: app.url ?? '',
    dateApplied: app.dateApplied ?? new Date().toISOString(),
    status: app.status ?? ('Applied' as JobApplication['status']),
    notes: app.notes ?? '',
    jobDescription: app.jobDescription ?? app.notes ?? '',
    coverLetter: app.coverLetter ?? '',
    tailoredCV: app.tailoredCV ?? '',
    interviewStages: app.interviewStages ?? [],
    nextAction: app.nextAction ?? '',
    nextActionDue: app.nextActionDue ?? '',
    recruiterContact: app.recruiterContact ?? null,
    takeHome: app.takeHome ?? null,
    offer: app.offer ?? null,
    statusHistory: app.statusHistory ?? [
      { status: app.status ?? ('Applied' as JobApplication['status']), date: app.dateApplied ?? new Date().toISOString() },
    ],
  };
  for (const key of REMOVED_APPLICATION_KEYS) {
    delete (migrated as unknown as Record<string, unknown>)[key];
  }
  return migrated;
}

export function createDefaultState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA,
    applications: [],
    behavioralAnswers: BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] })),
    baseCV: '',
    cvFileName: '',
    baseCoverLetter: '',
    portfolioUrl: '',
    coverLetterTemplate: '',
    cvTemplate: '',
    codingHistory: [],
  };
}

export function migrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultState();
  }

  const parsed = { ...(raw as Record<string, unknown>) } as Partial<AppState> & Record<string, unknown>;

  for (const key of REMOVED_KEYS) {
    delete parsed[key];
  }

  if (!Array.isArray(parsed.behavioralAnswers)) {
    parsed.behavioralAnswers = BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] }));
  }
  if (typeof parsed.baseCV !== 'string') parsed.baseCV = '';
  if (typeof parsed.baseCoverLetter !== 'string') parsed.baseCoverLetter = '';
  if (typeof parsed.cvFileName !== 'string') parsed.cvFileName = '';
  if (typeof parsed.portfolioUrl !== 'string') parsed.portfolioUrl = '';
  if (typeof parsed.coverLetterTemplate !== 'string') parsed.coverLetterTemplate = '';
  if (typeof parsed.cvTemplate !== 'string') parsed.cvTemplate = '';
  if (!Array.isArray(parsed.codingHistory)) parsed.codingHistory = [];

  parsed.applications = (Array.isArray(parsed.applications) ? parsed.applications : []).map(migrateApplication);
  parsed.schemaVersion = CURRENT_SCHEMA;

  return parsed as AppState;
}
