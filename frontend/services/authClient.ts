/**
 * Accounts: register, sign in, sign out, and the admin plan, Premium request
 * and deactivation switches.
 *
 * Auth responses are deliberately NOT wrapped in a `data` envelope — register
 * and login answer with a flat `{ user, token, hiddenTabs }`, and `me` with
 * `{ user, hiddenTabs }`.
 * Only the tracker endpoints use Laravel's resource wrapper.
 */

import { AccountPlan, AuthUser, NavTabKey, UserPreferences } from '../types/auth';
import { apiRequest, getStoredToken, setStoredToken } from './http';

// The token lives in localStorage under `mission_employed_token`; storage is
// owned by http.ts because every request needs it. Re-exported so callers can
// keep importing it from here.
export { getStoredToken, setStoredToken };

export interface AuthSession {
  user: AuthUser;
  token: string;
  /** Site-wide, set by an admin. Optional so an older server reads as none. */
  hiddenTabs?: NavTabKey[];
}

export async function registerAccount(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/register', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
}

export async function loginAccount(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
}

export async function fetchMe(): Promise<{ user: AuthUser; hiddenTabs?: NavTabKey[] }> {
  return apiRequest<{ user: AuthUser; hiddenTabs?: NavTabKey[] }>('/auth/me');
}

/** A partial save: keys left out keep their saved value. */
export async function updatePreferences(patch: Partial<UserPreferences>): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>('/auth/preferences', { method: 'PATCH', body: patch });
}

/** Revokes only the token that made the request, not every session. */
export async function logoutAccount(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}

export async function listAdminUsers(): Promise<{ users: AuthUser[] }> {
  return apiRequest<{ users: AuthUser[] }>('/admin/users');
}

/** One user's usage over a period, from ai_usage. Cost counts priced calls only. */
export interface UsageSummary {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Calls to a model with no known price, left out of `costUsd`. */
  unpricedCalls: number;
  lastUsedAt: string | null;
}

export interface UserUsage {
  userId: number;
  window: UsageSummary;
  allTime: UsageSummary;
  /** The window, by route pattern. `source: 'live'` was reported by the browser. */
  byFeature: (UsageSummary & { feature: string; source: 'server' | 'live' })[];
}

export interface UsageReport {
  days: number;
  since: string;
  /** Only users who have used anything, ever. */
  users: UserUsage[];
}

export async function fetchAdminUsage(days: number): Promise<UsageReport> {
  return apiRequest<UsageReport>(`/admin/usage?days=${days}`);
}

/**
 * Setting either plan answers a pending Premium request. `expiresAt` (ISO,
 * in the future) ends a Premium plan on that date; null means no end date.
 * The server ignores it for Free.
 */
export async function setUserPlan(
  userId: number,
  plan: AccountPlan,
  expiresAt: string | null = null,
): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>(`/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: { plan, expiresAt },
  });
}

/** Turn a Premium request down without changing the plan. */
export async function dismissPremiumRequest(userId: number): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>(`/admin/users/${userId}/premium-request`, { method: 'DELETE' });
}

/**
 * `false` locks the account and signs it out everywhere; `true` restores it.
 * The server refuses an admin deactivating themselves (`self_deactivation`).
 */
export async function setUserActive(userId: number, active: boolean): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>(`/admin/users/${userId}/active`, {
    method: 'PATCH',
    body: { active },
  });
}

/** Unauthenticated smoke test, used by deploy checks. */
/** Admin: the whole list of tabs users should not see. An empty list shows them all. */
export async function updateHiddenTabs(hiddenTabs: NavTabKey[]): Promise<{ hiddenTabs: NavTabKey[] }> {
  return apiRequest<{ hiddenTabs: NavTabKey[] }>('/admin/tabs', { method: 'PUT', body: { hiddenTabs } });
}

export async function checkHealth(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health', { anonymous: true });
}
