export type AccountPlan = 'free' | 'premium';
export type AccountRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: AccountRole;
  plan: AccountPlan;
  createdAt: string;
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
