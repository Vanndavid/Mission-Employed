
export enum JobStatus {
  APPLIED = 'Applied',
  INTERVIEWING = 'Interviewing',
  OFFER = 'Offer',
  REJECTED = 'Rejected'
}

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  url: string;
  dateApplied: string;
  status: JobStatus;
  criteriaScore: number;
  criteriaMet: string[]; // List of IDs from criteria
  notes: string;
}

export interface DailyLog {
  date: string; // ISO string YYYY-MM-DD
  completions: Record<string, boolean>; // Maps task ID to completion status
}

export interface BehavioralAnswer {
  themeId: string;
  bullets: string[];
}

export interface Criteria {
  id: string;
  label: string;
}

export interface AppState {
  applications: JobApplication[];
  dailyLogs: Record<string, DailyLog>;
  behavioralAnswers: BehavioralAnswer[];
  customCriteria: Criteria[];
  targetScore: number;
  baseCV: string;
  baseCoverLetter: string;
}

export interface TaskDefinition {
  id: string;
  label: string;
  time: string;
}
