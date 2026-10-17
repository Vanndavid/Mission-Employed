import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthUser, FeatureAllowance, PlanInfo, Subscription } from '../types/auth';

/**
 * Plan & usage: the account's allowances with what is left of each, both
 * plans side by side, and the Request Premium button an admin answers.
 *
 * The real SubscriptionProvider, stubbed at fetch, so the requests asserted
 * are the ones the API receives.
 */

let user: AuthUser;
let isAdmin = false;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user, isAdmin, isPremium: user.plan === 'premium', logout: vi.fn(), refreshUser: vi.fn() }),
}));

const { AccountPage } = await import('./AccountPage');
const { SubscriptionProvider } = await import('../contexts/SubscriptionContext');
const { ToastProvider } = await import('./ToastProvider');

function allowance(overrides: Partial<FeatureAllowance>): FeatureAllowance {
  return {
    key: 'job_parse',
    name: 'Job description parsing',
    description: 'Paste a job ad.',
    group: 'Job applications',
    enabled: true,
    limit: 5,
    period: 'month',
    used: 2,
    resetsAt: '2026-11-01T00:00:00+00:00',
    ...overrides,
  };
}

const plans: PlanInfo[] = [
  {
    key: 'free',
    name: 'Free',
    priceLabel: null,
    description: 'The tracker.',
    requestsPerMinute: 10,
    features: [
      { key: 'job_parse', enabled: true, limit: 5, period: 'month' },
      { key: 'tailored_cv', enabled: false, limit: 5, period: 'month' },
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    priceLabel: '$9 / month',
    description: 'Every AI tool.',
    requestsPerMinute: 30,
    features: [
      { key: 'job_parse', enabled: true, limit: 50, period: 'day' },
      { key: 'tailored_cv', enabled: true, limit: null, period: 'day' },
    ],
  },
];

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: 'free',
    planExpiresAt: null,
    premiumRequestedAt: null,
    requestsPerMinute: 10,
    features: [
      allowance({}),
      allowance({ key: 'tailored_cv', name: 'Tailored CV writer', enabled: false, used: 0 }),
    ],
    plans,
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let calls: { method: string; url: string }[];

function stubApi(current: () => Subscription, routes: Record<string, () => Response> = {}) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      const route = routes[`${method} ${url}`];
      if (route) return route();
      if (url === '/api/subscription') return json(current());
      return json({ message: `Unexpected ${method} ${url}` }, 500);
    }),
  );
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SubscriptionProvider>
          <AccountPage />
        </SubscriptionProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  isAdmin = false;
  user = {
    id: 1,
    email: 'me@example.com',
    role: 'user',
    plan: 'free',
    planExpiresAt: null,
    premiumRequestedAt: null,
    createdAt: '',
    deactivatedAt: null,
    preferences: { applicationsPageSize: 5 },
  };
});

afterEach(() => vi.unstubAllGlobals());

describe('AccountPage', () => {
  it('shows how much of each allowance is used, and what the plan leaves out', async () => {
    stubApi(() => subscription());
    renderPage();

    expect(await screen.findByText('2 of 5 used this month')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Job description parsing used' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getAllByText('Not on your plan')).toHaveLength(1);
  });

  it('says when a used-up allowance comes back', async () => {
    stubApi(() => subscription({ features: [allowance({ used: 5 })] }));
    renderPage();

    expect(await screen.findByText('5 of 5 used this month')).toBeTruthy();
    expect(screen.getByText(/^Comes back/)).toBeTruthy();
  });

  it('compares the plans with their limits and marks the current one', async () => {
    stubApi(() => subscription());
    renderPage();

    const premium = await screen.findByLabelText('Premium plan');
    expect(within(premium).getByText('$9 / month')).toBeTruthy();
    expect(within(premium).getByText('50 per day')).toBeTruthy();
    expect(within(premium).getByText('Unlimited')).toBeTruthy();
    expect(within(screen.getByLabelText('Free plan')).getByText('Your plan')).toBeTruthy();
  });

  it('asks for Premium, then lets the request be withdrawn', async () => {
    let current = subscription();
    stubApi(() => current, {
      'POST /api/subscription/request': () => {
        current = subscription({ premiumRequestedAt: '2026-10-17T12:00:00+00:00' });
        return json(current);
      },
      'DELETE /api/subscription/request': () => {
        current = subscription();
        return json(current);
      },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Request Premium' }));

    expect(await screen.findByText(/You asked for Premium on/)).toBeTruthy();
    expect(calls).toContainEqual({ method: 'POST', url: '/api/subscription/request' });

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));

    expect(await screen.findByRole('button', { name: 'Request Premium' })).toBeTruthy();
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/subscription/request' });
  });

  it('shows the end date of a Premium plan and offers no request', async () => {
    user = { ...user, plan: 'premium' };
    stubApi(() => subscription({ plan: 'premium', planExpiresAt: '2026-11-17T12:00:00+00:00' }));
    renderPage();

    expect(await screen.findByText(/^Premium until/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request Premium' })).toBeNull();
  });

  it('says when a lapsed Premium plan ended', async () => {
    stubApi(() => subscription({ planExpiresAt: '2026-10-01T00:00:00+00:00' }));
    renderPage();

    expect(await screen.findByText(/Your Premium plan ended on/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request Premium' })).toBeTruthy();
  });

  it('links an admin to both admin screens', async () => {
    isAdmin = true;
    stubApi(() => subscription({ plan: 'premium', requestsPerMinute: null }));
    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: /Plans & limits/ })).toHaveAttribute('href', '/account/admin/plans'));
    expect(screen.getByRole('link', { name: /Users & usage/ })).toHaveAttribute('href', '/account/admin');
  });
});
