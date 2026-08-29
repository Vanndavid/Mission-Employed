/**
 * The single HTTP layer every client module goes through.
 *
 * Two things live here rather than being reinvented per feature:
 *
 * 1. **One error shape.** Laravel answers failures in a handful of documented
 *    ways and {@link ApiError} normalizes all of them, so a screen can ask
 *    `err.isPremiumRequired` instead of pattern-matching bodies:
 *      - 401                              → the token is dead, log the user out
 *      - 403 `{message, code}`            → `premium_required` / `admin_required`
 *      - 422 `{message, errors}`          → standard validation failure
 *      - 502 `{code: 'ai_unavailable'}`   → Gemini failed, contained server-side
 * 2. **The resource envelope.** Tracker endpoints return Laravel's default
 *    `{ data: ... }` wrapper; auth and AI endpoints return flat objects. The
 *    caller says which it expects rather than this module guessing.
 */

/** Everything is served under /api — the Vite dev server proxies it to :8000. */
export const API_BASE = '/api';

export type ValidationErrors = Record<string, string[]>;

/** A failed request, with the server's own message where there is one. */
export class ApiError extends Error {
  readonly status: number;

  /** The server's machine-readable reason, when it sent one. */
  readonly code?: string;

  /** Field errors from a 422, keyed by the input name the client sent. */
  readonly errors?: ValidationErrors;

  constructor(status: number, message: string, code?: string, errors?: ValidationErrors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  /** The token is missing, expired or revoked. The user has to sign in again. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** A free account hit a premium-gated route. Show the upgrade prompt. */
  get isPremiumRequired(): boolean {
    return this.status === 403 && this.code === 'premium_required';
  }

  /** A non-admin hit an admin route. */
  get isAdminRequired(): boolean {
    return this.status === 403 && this.code === 'admin_required';
  }

  /** Gemini failed. The detail is in the server log, never in this message. */
  get isAiUnavailable(): boolean {
    return this.status === 502 || this.code === 'ai_unavailable';
  }

  /** The record does not exist, or belongs to someone else — the API does not say which. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  /** The first field error, which is usually the one worth showing. */
  firstFieldError(): string | null {
    for (const messages of Object.values(this.errors ?? {})) {
      if (messages?.length) return messages[0];
    }
    return null;
  }
}

/**
 * True when a request was cancelled rather than failing — a load whose
 * component unmounted, which is not an error worth showing anyone.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Turn anything thrown by a request into a sentence a screen can render. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) {
    return error.firstFieldError() ?? error.message ?? fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const TOKEN_KEY = 'mission_employed_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode or storage disabled — the session just will not persist */
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Register what happens when any request comes back 401. AuthContext uses this
 * to drop the dead token and send the user back to the sign-in screen, so no
 * individual screen has to notice.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the global 401 handler — login and register answer for themselves. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function readError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let errors: ValidationErrors | undefined;

  const raw = await res.text().catch(() => '');
  if (raw) {
    try {
      const body = JSON.parse(raw) as {
        message?: string;
        code?: string;
        errors?: ValidationErrors;
      };
      if (typeof body.message === 'string' && body.message) message = body.message;
      if (typeof body.code === 'string') code = body.code;
      if (body.errors && typeof body.errors === 'object') errors = body.errors;
    } catch {
      // A non-JSON body means something upstream of Laravel answered; the
      // status line is more useful to the user than the HTML.
    }
  }

  return new ApiError(res.status, message, code, errors);
}

/** Perform a request and return the parsed body. 204 resolves to undefined. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getStoredToken();
  if (token && !anonymous) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // fetch only rejects when the request never completed.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'Could not reach the server. Is the API running?', 'network');
  }

  if (!res.ok) {
    const error = await readError(res);
    if (error.isUnauthorized && !anonymous) unauthorizedHandler?.();
    throw error;
  }

  if (res.status === 204) return undefined as T;

  const raw = await res.text();
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

/**
 * Same as {@link apiRequest} for the tracker endpoints, which wrap their
 * payload in Laravel's `{ data: ... }` resource envelope.
 */
export async function apiResource<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = await apiRequest<{ data: T }>(path, options);
  return body?.data as T;
}
