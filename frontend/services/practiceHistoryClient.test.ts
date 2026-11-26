import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './http';
import { fetchPracticeAttempt, fetchPracticeAttempts, fetchPracticeProgress } from './practiceHistoryClient';

/** The routes the practice history and the coach read. */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastUrl = () => (fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit])[0];

describe('practiceHistoryClient', () => {
  it('reads progress across the modes', async () => {
    await fetchPracticeProgress();
    expect(lastUrl()).toBe('/api/practice/progress');
  });

  it('pages through attempts, with a mode only when one is picked', async () => {
    await fetchPracticeAttempts();
    expect(lastUrl()).toBe('/api/practice/attempts');

    await fetchPracticeAttempts({ kind: 'code_review', page: 2 });
    expect(lastUrl()).toBe('/api/practice/attempts?kind=code_review&page=2');

    await fetchPracticeAttempts({ kind: null, page: 1 });
    expect(lastUrl()).toBe('/api/practice/attempts');
  });

  it('reads one attempt, and someone else’s is a 404', async () => {
    await fetchPracticeAttempt(41);
    expect(lastUrl()).toBe('/api/practice/attempts/41');

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));
    const missing = await fetchPracticeAttempt(42).catch(e => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing.isNotFound).toBe(true);
  });
});
