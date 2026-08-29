import { AuthUser, AccountPlan } from '../types/auth';

const TOKEN_KEY = 'mission_employed_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseError(res: Response): Promise<Error & { code?: string; status?: number }> {
  let message = `Request failed: ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body.error || body.message || message;
    code = body.code;
  } catch {
    try {
      message = (await res.text()) || message;
    } catch {
      /* ignore */
    }
  }
  const err = new Error(message) as Error & { code?: string; status?: number };
  err.status = res.status;
  err.code = code;
  return err;
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function registerAccount(email: string, password: string) {
  return authFetch<{ user: AuthUser; token: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginAccount(email: string, password: string) {
  return authFetch<{ user: AuthUser; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe() {
  return authFetch<{ user: AuthUser }>('/api/auth/me');
}

export async function listAdminUsers() {
  return authFetch<{ users: AuthUser[] }>('/api/admin/users');
}

export async function setUserPlan(userId: string, plan: AccountPlan) {
  return authFetch<{ user: AuthUser }>(`/api/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  });
}
