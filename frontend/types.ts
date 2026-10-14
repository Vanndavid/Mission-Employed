
export enum JobStatus {
  SAVED = 'Saved',
  APPLIED = 'Applied',
  // No reply a month after applying; the server moves Applied here by itself.
  // Before Interviewing because a late reply moves it on (see statusAdvances).
  GHOSTED = 'Ghosted',
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

/** Which CV an ATS check measured: the application's own, or the profile's. */
export type AtsSource = 'tailored' | 'base';

export interface AtsKeyword {
  term: string;
  kind: 'skill' | 'qualification' | 'soft_skill';
  required: boolean;
}

export interface AtsCheck {
  id: 'contact' | 'sections' | 'title' | 'length' | 'measurable';
  label: string;
  passed: boolean;
  detail: string;
}

/**
 * The last ATS score check of an application. Written only by
 * POST /api/ai/applications/{id}/ats — never sent back in a PATCH.
 *
 * The score is 80 points of keyword coverage (required keywords count double,
 * soft skills half) plus 4 points per passed format check. It is computed by
 * the server, not the model, so the same CV and job always score the same.
 */
export interface AtsReport {
  score: number;
  keywords: { matched: number; total: number };
  matched: AtsKeyword[];
  /** Required ones first. */
  missing: AtsKeyword[];
  checks: AtsCheck[];
  source: AtsSource;
  /** ISO timestamp. */
  checkedAt: string;
  /** The CV or the job description has changed since this check. */
  stale: boolean;
}

export interface JobApplication {
  /** Auto-increment from the database — see the note on InterviewStage.id. */
  id: number;
  company: string;
  role: string;
  location?: string;
  url: string;
  /** Where it came from: a job board, a recruiter, the company's own site. */
  source: string;
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
  /**
   * Why it was turned down, one short phrase each — e.g. the screening
   * questions a Seek rejection lists. Filled by the MCP email sync.
   */
  rejectionReasons?: string[];
  /** The last ATS score check, or null when there has not been one. */
  atsReport?: AtsReport | null;
}

/**
 * The fields a client may send when creating or patching an application.
 * `id`, `interviewStages`, `statusHistory` and `atsReport` are server-owned.
 *
 * `statusDate` is write-only, which is why it is added here rather than to
 * JobApplication: it is not a column, it dates the status event the server
 * writes when the status is set or changed. A spreadsheet import is the only
 * thing that sends it, so the timeline shows when a status actually changed
 * rather than when the row was imported.
 */
export type ApplicationInput = Partial<
  Omit<JobApplication, 'id' | 'interviewStages' | 'statusHistory' | 'atsReport'>
> & { statusDate?: string };

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
