export type AccountPlan = 'free' | 'premium';
export type AccountRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  email: string;
  role: AccountRole;
  /** The effective plan: admins read as premium, a lapsed premium plan as free. */
  plan: AccountPlan;
  /**
   * When a Premium plan ends, kept after it passes so a lapse can be shown.
   * Null for no end date, and on Free.
   */
  planExpiresAt: string | null;
  /** Set by "Request Premium" until an admin answers it. */
  premiumRequestedAt: string | null;
  createdAt: string;
  /** Set while an admin has the account locked; null means active. */
  deactivatedAt: string | null;
  /** Saved on the account, so they follow the user to another device. */
  preferences: UserPreferences;
}

/** The server fills in defaults, so every key is always present. */
export interface UserPreferences {
  /** Rows per page in the tracker; one of APPLICATIONS_PAGE_SIZES. */
  applicationsPageSize: number;
}

/** Mirrors App\Enums\Feature. Each is enforced server-side by the `feature` middleware. */
export type FeatureKey =
  | 'coding_problem'
  | 'coding_tutor'
  | 'job_parse'
  | 'spreadsheet_import'
  | 'cover_letter'
  | 'tailored_cv'
  | 'ats_check'
  | 'seek_jobs'
  | 'interview_practice'
  | 'spoken_playback'
  | 'mock_interview';

/** Mirrors App\Enums\QuotaPeriod: calendar periods in UTC. */
export type QuotaPeriod = 'day' | 'week' | 'month';

export const QUOTA_PERIODS: QuotaPeriod[] = ['day', 'week', 'month'];

/** One plan's terms for one feature. A null limit is unlimited. */
export interface FeatureSetting {
  key: FeatureKey;
  enabled: boolean;
  limit: number | null;
  period: QuotaPeriod;
}

export interface FeatureInfo {
  key: FeatureKey;
  name: string;
  /** What it does and what counts as one use. */
  description: string;
  group: string;
}

/** A feature as the signed-in account has it: its plan's terms and its usage. */
export interface FeatureAllowance extends FeatureInfo, FeatureSetting {
  /** Uses so far in the current period. */
  used: number;
  /** When the period ends; null when the feature is unlimited. */
  resetsAt: string | null;
}

export interface PlanInfo {
  key: AccountPlan;
  name: string;
  priceLabel: string | null;
  description: string | null;
  /** Metered requests per minute, every feature combined. Null: no cap. */
  requestsPerMinute: number | null;
  features: FeatureSetting[];
}

/** GET /api/subscription. */
export interface Subscription {
  plan: AccountPlan;
  planExpiresAt: string | null;
  premiumRequestedAt: string | null;
  requestsPerMinute: number | null;
  features: FeatureAllowance[];
  plans: PlanInfo[];
}

/**
 * Free on every plan and not metered, so never in the catalog. Shown on the
 * plans page so Free does not look empty.
 */
export const ALWAYS_INCLUDED = [
  'Application tracker with interview stages',
  'Spreadsheet import and CSV export',
  'Rejection insights',
  'Coding attempt history',
  'Interview fact bank',
  'Connect an AI agent (MCP)',
] as const;

export function isPremiumUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.plan === 'premium' || user.role === 'admin';
}
