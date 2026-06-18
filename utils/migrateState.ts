
import { AppState, HuntPersonaId, JobApplication } from '../types';
import { BEHAVIORAL_THEMES, HUNT_PERSONAS, PHASE2_CRITERIA } from '../constants';

export const CURRENT_SCHEMA = 2;

function migrateApplication(app: Partial<JobApplication>): JobApplication {
  return {
    id: app.id ?? crypto.randomUUID(),
    company: app.company ?? 'Unknown',
    role: app.role ?? 'Software Engineer',
    location: app.location ?? '',
    url: app.url ?? '',
    dateApplied: app.dateApplied ?? new Date().toISOString(),
    status: app.status ?? ('Applied' as JobApplication['status']),
    criteriaScore: app.criteriaScore ?? app.criteriaMet?.length ?? 0,
    criteriaMet: app.criteriaMet ?? [],
    notes: app.notes ?? '',
    jobDescription: app.jobDescription ?? app.notes ?? '',
    coverLetter: app.coverLetter ?? '',
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
}

export function createDefaultState(): AppState {
  const persona = HUNT_PERSONAS.maintenance_swe;
  return {
    schemaVersion: CURRENT_SCHEMA,
    applications: [],
    dailyLogs: {},
    behavioralAnswers: BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] })),
    customCriteria: persona.criteria,
    targetScore: persona.targetScore,
    baseCV: '',
    cvFileName: '',
    baseCoverLetter: '',
    portfolioUrl: '',
    coverLetterTemplate: '',
    huntPersona: 'maintenance_swe',
    codingHistory: [],
    contacts: [],
  };
}

export function migrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultState();
  }

  const parsed = raw as Partial<AppState> & { schemaVersion?: number };

  if (!parsed.customCriteria) parsed.customCriteria = PHASE2_CRITERIA;
  if (!parsed.targetScore) parsed.targetScore = 4;
  if (!parsed.behavioralAnswers) {
    parsed.behavioralAnswers = BEHAVIORAL_THEMES.map(t => ({ themeId: t.id, bullets: [''] }));
  }
  if (!parsed.baseCV) parsed.baseCV = '';
  if (!parsed.baseCoverLetter) parsed.baseCoverLetter = '';

  if (!parsed.huntPersona) parsed.huntPersona = 'maintenance_swe' as HuntPersonaId;
  if (!parsed.codingHistory) parsed.codingHistory = [];
  if (!parsed.contacts) parsed.contacts = [];
  if (!parsed.cvFileName) parsed.cvFileName = '';
  if (!parsed.portfolioUrl) parsed.portfolioUrl = '';
  if (!parsed.coverLetterTemplate) parsed.coverLetterTemplate = '';

  parsed.applications = (parsed.applications ?? []).map(migrateApplication);
  parsed.schemaVersion = CURRENT_SCHEMA;

  return parsed as AppState;
}
