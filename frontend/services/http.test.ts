import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  apiResource,
  errorMessage,
  setStoredToken,
  setUnauthorizedHandler,
} from './http';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiError', () => {
  it('flags a premium_required 403', () => {
    const error = new ApiError(403, 'Premium required.', 'premium_required');

    expect(error.isPremiumRequired).toBe(true);
    expect(error.isAdminRequired).toBe(false);
    expect(error.isUnauthorized).toBe(false);
  });

  it('flags an admin_required 403', () => {
    const error = new ApiError(403, 'Admins only.', 'admin_required');

    expect(error.isAdminRequired).toBe(true);
    expect(error.isPremiumRequired).toBe(false);
  });

  it('flags a 401 as unauthorized', () => {
    expect(new ApiError(401, 'Unauthenticated.').isUnauthorized).toBe(true);
  });

  it('treats a contained Gemini 502 as AI unavailable, not a Seek outage', () => {
    const ai = new ApiError(502, 'The AI service is unavailable right now.', 'ai_unavailable');
    const seek = new ApiError(502, 'Seek is unavailable.', 'seek_unavailable');
    const unknownBadGateway = new ApiError(502, 'Bad gateway');

    expect(ai.isAiUnavailable).toBe(true);
    expect(ai.isSeekUnavailable).toBe(false);
    expect(seek.isAiUnavailable).toBe(false);
    expect(seek.isSeekUnavailable).toBe(true);
    expect(unknownBadGateway.isAiUnavailable).toBe(true);
  });

  it('exposes the first field error from a 422', () => {
    const error = new ApiError(422, 'The given data was invalid.', undefined, {
      company: ['The company field is required.'],
      role: ['The role field is required.'],
    });

    expect(error.isValidation).toBe(true);
    expect(error.firstFieldError()).toBe('The company field is required.');
  });
});

describe('errorMessage', () => {
  it('prefers a field error, then the ApiError message, then the fallback', () => {
    expect(
      errorMessage(new ApiError(422, 'Invalid.', undefined, { company: ['Company is required.'] })),
    ).toBe('Company is required.');
    expect(errorMessage(new ApiError(502, 'The AI service is unavailable right now.', 'ai_unavailable')))
      .toBe('The AI service is unavailable right now.');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('not an error', 'Something went wrong.')).toBe('Something went wrong.');
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it('returns the parsed body and sends the stored bearer token', async () => {
    setStoredToken('1|test-token');
    const fetchMock = vi.fn(async () => json({ text: 'hello' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/ai/tts', { method: 'POST', body: { text: 'hi' } }))
      .resolves.toEqual({ text: 'hello' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
    }));
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer 1|test-token');
  });

  it('calls the unauthorized handler on a 401, then throws', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setStoredToken('1|dead');
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Unauthenticated.' }, 401)));

    const error = await apiRequest('/auth/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnauthorized).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not call the unauthorized handler for an anonymous 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Invalid credentials.' }, 401)));

    await expect(apiRequest('/auth/login', { method: 'POST', body: {}, anonymous: true }))
      .rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('surfaces a premium 403 as ApiError.isPremiumRequired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'Premium required.', code: 'premium_required' }, 403)),
    );

    const error = await apiRequest('/ai/coding/problem', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isPremiumRequired).toBe(true);
  });
});

describe('apiResource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps Laravel\'s { data } envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: { id: 5, company: 'Acme' } })));

    await expect(apiResource('/applications')).resolves.toEqual({ id: 5, company: 'Acme' });
  });
});
