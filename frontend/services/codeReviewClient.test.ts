import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCodeReview, fetchNextSnippet, submitCodeReview } from './codeReviewClient';
import { ApiError } from './http';

/** The routes and bodies the code review screen sends. */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
};

describe('codeReviewClient', () => {
  it('asks for the next snippet with only the filters that are set', async () => {
    await fetchNextSnippet();
    expect(lastCall()).toMatchObject({ url: '/api/practice/code-review/next', method: 'GET' });

    await fetchNextSnippet({ language: 'python', difficulty: null, exclude: 7 });
    expect(lastCall().url).toBe('/api/practice/code-review/next?language=python&exclude=7');
  });

  it('posts the comments, and the summary only when there is one', async () => {
    await submitCodeReview(7, [{ line: 3, body: 'Injection.' }], '   ');
    expect(lastCall()).toEqual({
      url: '/api/practice/code-review/7/reviews',
      method: 'POST',
      body: { comments: [{ line: 3, body: 'Injection.' }] },
    });

    await submitCodeReview(7, [{ line: 3, body: 'Injection.' }], ' Mostly fine. ');
    expect(lastCall().body).toEqual({ comments: [{ line: 3, body: 'Injection.' }], summary: 'Mostly fine.' });
  });

  it('reads a stored review back', async () => {
    await fetchCodeReview(41);
    expect(lastCall()).toMatchObject({ url: '/api/practice/code-review/reviews/41', method: 'GET' });
  });

  it('passes a plan refusal through as an ApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Code review practice is a Premium feature.', code: 'premium_required' }), { status: 403 }),
    );

    const refused = await submitCodeReview(7, [{ line: 3, body: 'x' }], '').catch(e => e);

    expect(refused).toBeInstanceOf(ApiError);
    expect(refused.isPremiumRequired).toBe(true);
    expect(refused.message).toBe('Code review practice is a Premium feature.');
  });
});
