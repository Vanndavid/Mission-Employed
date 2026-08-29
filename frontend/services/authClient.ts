/**
 * Accounts: register, sign in, sign out, and the admin plan switch.
 *
 * Auth responses are deliberately NOT wrapped in a `data` envelope — register
 * and login answer with a flat `{ user, token }`, and `me` with `{ user }`.
 * Only the tracker endpoints use Laravel's resource wrapper.
 */

import { AccountPlan, AuthUser } from '../types/auth';
import { apiRequest, getStoredToken, setStoredToken } from './http';

// The token lives in localStorage under `mission_employed_token`; storage is
// owned by http.ts because every request needs it. Re-exported so callers can
// keep importing it from here.
export { getStoredToken, setStoredToken };

export interface AuthSession {
  user: AuthUser;
  token: string;
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

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>('/auth/me');
}

/** Revokes only the token that made the request, not every session. */
export async function logoutAccount(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}

export async function listAdminUsers(): Promise<{ users: AuthUser[] }> {
  return apiRequest<{ users: AuthUser[] }>('/admin/users');
}

export async function setUserPlan(userId: number, plan: AccountPlan): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>(`/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: { plan },
  });
}

/** Unauthenticated smoke test, used by deploy checks. */
export async function checkHealth(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health', { anonymous: true });
}
