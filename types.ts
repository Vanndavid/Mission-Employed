
export enum JobStatus {
  SAVED = 'Saved',
  APPLIED = 'Applied',
  INTERVIEWING = 'Interviewing',
  OFFER = 'Offer',
  REJECTED = 'Rejected'
}

export type HuntPersonaId = 'maintenance_swe' | 'big_tech' | 'startup' | 'career_switcher';

export type InterviewStageType =
  | 'phone'
  | 'technical'
  | 'system_design'
  | 'behavioral'
  | 'onsite'
  | 'take_home';

export type TakeHomeStatus = 'not_started' | 'in_progress' | 'submitted';

export interface InterviewStage {
  id: string;
  type: InterviewStageType;
  scheduledAt: string;
  notes?: string;
}

export interface RecruiterContact {
  name: string;
  email: string;
  linkedin: string;
}

export interface TakeHome {
  deadline: string;
  repo: string;
  status: TakeHomeStatus;
}

export interface OfferDetails {
  base: number;
  equity: string;
  benefits: string;
  startDate: string;
}

export interface StatusHistoryEntry {
  status: JobStatus;
  date: string;
}

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  location?: string;
  url: string;
  dateApplied: string;
  status: JobStatus;
  criteriaScore: number;
  criteriaMet: string[];
  notes: string;
  jobDescription: string;
  coverLetter: string;
  interviewStages: InterviewStage[];
  nextAction: string;
  nextActionDue: string;
  recruiterContact: RecruiterContact | null;
  takeHome: TakeHome | null;
  offer: OfferDetails | null;
  statusHistory?: StatusHistoryEntry[];
}

export interface DailyLog {
  date: string;
  completions: Record<string, boolean>;
}

export interface BehavioralAnswer {
  themeId: string;
  bullets: string[];
}

export interface Criteria {
  id: string;
  label: string;
}

export interface CodingHistoryEntry {
  date: string;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  completed: boolean;
  topics: string[];
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  email: string;
  lastContact: string;
  applicationIds: string[];
}

export interface AppState {
  schemaVersion: number;
  applications: JobApplication[];
  dailyLogs: Record<string, DailyLog>;
  behavioralAnswers: BehavioralAnswer[];
  customCriteria: Criteria[];
  targetScore: number;
  baseCV: string;
  cvFileName: string;
  baseCoverLetter: string;
  portfolioUrl: string;
  coverLetterTemplate: string;
  huntPersona: HuntPersonaId;
  codingHistory: CodingHistoryEntry[];
  contacts: Contact[];
}

export interface TaskDefinition {
  id: string;
  label: string;
  time: string;
}

export interface InterviewTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  feedback?: string;
}
