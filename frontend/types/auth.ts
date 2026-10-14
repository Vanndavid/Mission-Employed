export type AccountPlan = 'free' | 'premium';
export type AccountRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  email: string;
  role: AccountRole;
  plan: AccountPlan;
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

export const PREMIUM_FEATURES = [
  'AI coding tutor',
  'Behavioral audio prep',
  'Mock interview sim',
  'Job parse',
  'Cover letter & CV generation',
] as const;

export function isPremiumUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.plan === 'premium' || user.role === 'admin';
}
