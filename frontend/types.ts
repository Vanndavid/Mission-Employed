
export enum JobStatus {
  SAVED = 'Saved',
  APPLIED = 'Applied',
  INTERVIEWING = 'Interviewing',
  OFFER = 'Offer',
  REJECTED = 'Rejected'
}

export type InterviewStageType =
  | 'phone'
  | 'technical'
  | 'system_design'
  | 'behavioral'
  | 'onsite'
  | 'take_home';

export type TakeHomeStatus = 'not_started' | 'in_progress' | 'submitted';

export interface InterviewStage {
  /**
   * Auto-increment from the database. These used to be client-generated
   * `crypto.randomUUID()` strings; the server owns them now, so a new stage is
   * whatever POST answered with — never a locally invented record.
   */
  id: number;
  type: InterviewStageType;
  /** '' when the stage has no date yet: the API never sends null for this. */
  scheduledAt: string;
  notes?: string;
}

/** A stage before the server has given it an id. */
export type NewInterviewStage = Omit<InterviewStage, 'id'>;

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
  /** Auto-increment from the database — see the note on InterviewStage.id. */
  id: number;
  company: string;
  role: string;
  location?: string;
  url: string;
  /** 'YYYY-MM-DD', or '' when never applied. Nullable columns read back as ''. */
  dateApplied: string;
  status: JobStatus;
  /** Starred by the user. Starred rows pin to the top of the tracker table. */
  isImportant: boolean;
  notes: string;
  jobDescription: string;
  coverLetter: string;
  tailoredCV: string;
  interviewStages: InterviewStage[];
  nextAction: string;
  nextActionDue: string;
  recruiterContact: RecruiterContact | null;
  takeHome: TakeHome | null;
  offer: OfferDetails | null;
  statusHistory?: StatusHistoryEntry[];
}

/**
 * The fields a client may send when creating or patching an application.
 * `id`, `interviewStages` and `statusHistory` are server-owned and ignored.
 */
export type ApplicationInput = Partial<
  Omit<JobApplication, 'id' | 'interviewStages' | 'statusHistory'>
>;

export interface BehavioralAnswer {
  themeId: string;
  bullets: string[];
}

export interface CodingHistoryEntry {
  /** Present on anything read back from the API; absent on a fresh attempt. */
  id?: number;
  date: string;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  completed: boolean;
  topics: string[];
}

/** An attempt on its way to the server, before it has a row. */
export type NewCodingAttempt = Omit<CodingHistoryEntry, 'id'>;

/**
 * The CV and cover letter settings, one row per user. This replaces the half
 * of the old localStorage AppState blob that was not a list of records.
 */
export interface UserProfile {
  baseCV: string;
  cvFileName: string;
  baseCoverLetter: string;
  portfolioUrl: string;
  coverLetterTemplate: string;
  cvTemplate: string;
}

export interface InterviewTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  feedback?: string;
}
