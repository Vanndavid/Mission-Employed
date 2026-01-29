
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
  criteriaMet: string[]; // List of IDs from PHASE2_CRITERIA
  notes: string;
}

export interface DailyLog {
  date: string; // ISO string YYYY-MM-DD
  codingEasy: boolean;
  codingMedium: boolean;
  behavioral: boolean;
  simulation: boolean;
}

export interface BehavioralAnswer {
  themeId: string;
  bullets: string[];
}

export interface AppState {
  applications: JobApplication[];
  dailyLogs: Record<string, DailyLog>;
  behavioralAnswers: BehavioralAnswer[];
  baseCV: string;
  baseCoverLetter: string;
}

export interface Criteria {
  id: string;
  label: string;
}
