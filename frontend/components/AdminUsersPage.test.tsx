import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The admin screen's usage columns: each user's tokens and estimated cost over
 * the chosen window, all-time cost, and a per-feature breakdown on request.
 * Plus deactivating and reactivating an account.
 */

const listAdminUsers = vi.fn();
const fetchAdminUsage = vi.fn();
const setUserActive = vi.fn();
const setUserPlan = vi.fn();
const dismissPremiumRequest = vi.fn();

vi.mock('../services/authClient', () => ({
  listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
  fetchAdminUsage: (...args: unknown[]) => fetchAdminUsage(...args),
  setUserPlan: (...args: unknown[]) => setUserPlan(...args),
  setUserActive: (...args: unknown[]) => setUserActive(...args),
  dismissPremiumRequest: (...args: unknown[]) => dismissPremiumRequest(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, user: { id: 9, email: 'me@example.com', role: 'admin' } }),
}));

const { AdminUsersPage } = await import('./AdminUsersPage');
const { ToastProvider } = await import('./ToastProvider');

const summary = (totalTokens: number, costUsd: number, extra: Record<string, unknown> = {}) => ({
  calls: 3,
  promptTokens: totalTokens - 100,
  outputTokens: 100,
  thoughtTokens: 0,
  totalTokens,
  costUsd,
  unpricedCalls: 0,
  lastUsedAt: '2026-09-25T10:00:00.000000Z',
  ...extra,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AdminUsersPage />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  listAdminUsers.mockReset().mockResolvedValue({
    users: [
      { id: 1, email: 'quiet@example.com', role: 'user', plan: 'free', createdAt: '', deactivatedAt: null },
      { id: 2, email: 'heavy@example.com', role: 'user', plan: 'premium', createdAt: '', deactivatedAt: null },
    ],
  });
  fetchAdminUsage.mockReset().mockResolvedValue({
    days: 30,
    since: '2026-08-27T12:00:00.000000Z',
    users: [
      {
        userId: 2,
        window: summary(1_250_000, 4.2),
        allTime: summary(3_400_000, 11.5),
        byFeature: [
          { feature: 'ai/mock/live', source: 'live', ...summary(1_000_000, 3.9) },
          { feature: 'ai/mock/sessions/{session}/report', source: 'server', ...summary(250_000, 0.3) },
        ],
      },
    ],
  });
});

describe('AdminUsersPage usage', () => {
  it("shows each user's tokens and estimated cost, heaviest first", async () => {
    renderPage();

    const heavy = (await screen.findByText('heavy@example.com')).closest('tr')!;
    expect(within(heavy).getByText('1.25M')).toBeTruthy();
    expect(within(heavy).getByText('$4.20')).toBeTruthy();
    expect(within(heavy).getByText('$11.50')).toBeTruthy();

    const rows = screen.getAllByRole('row').map(row => row.textContent ?? '');
    expect(rows.findIndex(r => r.includes('heavy@'))).toBeLessThan(rows.findIndex(r => r.includes('quiet@')));

    // Someone who has used nothing reads as zero, not as missing.
    const quiet = screen.getByText('quiet@example.com').closest('tr')!;
    expect(within(quiet).getAllByText('0').length).toBeGreaterThan(0);
  });

  it('breaks a user down by feature, marking the browser-reported voice usage', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Usage details for heavy@example.com' }));

    expect(screen.getByText('Mock interview (voice)')).toBeTruthy();
    expect(screen.getByText('reported by browser')).toBeTruthy();
    expect(screen.getByText('Mock interview report')).toBeTruthy();
  });

  it('refetches for another window', async () => {
    renderPage();
    await screen.findByText('heavy@example.com');
    expect(fetchAdminUsage).toHaveBeenLastCalledWith(30);

    fireEvent.change(screen.getByLabelText('Usage window'), { target: { value: '7' } });

    await waitFor(() => expect(fetchAdminUsage).toHaveBeenLastCalledWith(7));
  });
});

describe('AdminUsersPage deactivation', () => {
  const confirm = vi.spyOn(window, 'confirm');

  beforeEach(() => {
    confirm.mockReset().mockReturnValue(true);
    setUserActive.mockReset();
    listAdminUsers.mockResolvedValue({
      users: [
        { id: 1, email: 'quiet@example.com', role: 'user', plan: 'free', createdAt: '', deactivatedAt: null },
        { id: 3, email: 'locked@example.com', role: 'user', plan: 'free', createdAt: '', deactivatedAt: '2026-09-30T08:00:00+00:00' },
        { id: 9, email: 'me@example.com', role: 'admin', plan: 'premium', createdAt: '', deactivatedAt: null },
      ],
    });
  });

  it('deactivates an account after confirming, and marks the row', async () => {
    setUserActive.mockResolvedValue({
      user: { id: 1, email: 'quiet@example.com', role: 'user', plan: 'free', createdAt: '', deactivatedAt: '2026-10-01T09:00:00+00:00' },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate quiet@example.com' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('quiet@example.com'));
    expect(setUserActive).toHaveBeenCalledWith(1, false);
    const row = (await screen.findByRole('button', { name: 'Reactivate quiet@example.com' })).closest('tr')!;
    expect(within(row).getByText('Deactivated')).toBeTruthy();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    confirm.mockReturnValue(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate quiet@example.com' }));

    expect(setUserActive).not.toHaveBeenCalled();
  });

  it('reactivates a deactivated account without asking', async () => {
    setUserActive.mockResolvedValue({
      user: { id: 3, email: 'locked@example.com', role: 'user', plan: 'free', createdAt: '', deactivatedAt: null },
    });
    renderPage();

    const row = (await screen.findByText('locked@example.com')).closest('tr')!;
    expect(within(row).getByText('Deactivated')).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Reactivate locked@example.com' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(setUserActive).toHaveBeenCalledWith(3, true);
    await screen.findByRole('button', { name: 'Deactivate locked@example.com' });
  });

  it('offers no way to deactivate your own account', async () => {
    renderPage();
    await screen.findByText('me@example.com');

    expect(screen.queryByRole('button', { name: 'Deactivate me@example.com' })).toBeNull();
  });
});

describe('AdminUsersPage plans', () => {
  const free = { id: 1, email: 'quiet@example.com', role: 'user', plan: 'free', planExpiresAt: null, premiumRequestedAt: null, createdAt: '', deactivatedAt: null };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    setUserPlan.mockReset();
    dismissPremiumRequest.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('lists accounts waiting for Premium first, and says how many', async () => {
    listAdminUsers.mockResolvedValue({
      users: [
        { ...free, id: 2, email: 'heavy@example.com', plan: 'premium' },
        { ...free, premiumRequestedAt: '2026-10-16T09:00:00+00:00' },
      ],
    });
    renderPage();

    expect(await screen.findByText(/1 account is waiting for Premium/)).toBeTruthy();
    const rows = screen.getAllByRole('row').map(row => row.textContent ?? '');
    expect(rows.findIndex(r => r.includes('quiet@'))).toBeLessThan(rows.findIndex(r => r.includes('heavy@')));
    expect(within(screen.getByText('quiet@example.com').closest('tr')!).getByText(/Wants Premium/)).toBeTruthy();
  });

  it('grants Premium for a month by default', async () => {
    listAdminUsers.mockResolvedValue({ users: [free] });
    setUserPlan.mockResolvedValue({ user: { ...free, plan: 'premium', planExpiresAt: '2026-11-17T12:00:00.000Z' } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Grant Premium for quiet@example.com' }));

    await waitFor(() => expect(setUserPlan).toHaveBeenCalledWith(1, 'premium', '2026-11-17T12:00:00.000Z'));
    expect(await screen.findByText(/^until /)).toBeTruthy();
  });

  it('grants Premium with no end date when picked', async () => {
    listAdminUsers.mockResolvedValue({ users: [free] });
    setUserPlan.mockResolvedValue({ user: { ...free, plan: 'premium' } });
    renderPage();

    fireEvent.change(await screen.findByLabelText('Premium period for quiet@example.com'), { target: { value: 'null' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant Premium for quiet@example.com' }));

    await waitFor(() => expect(setUserPlan).toHaveBeenCalledWith(1, 'premium', null));
  });

  it('extends Premium from its current end date', async () => {
    const premium = { ...free, plan: 'premium', planExpiresAt: '2026-10-24T12:00:00.000Z' };
    listAdminUsers.mockResolvedValue({ users: [premium] });
    setUserPlan.mockResolvedValue({ user: premium });
    renderPage();

    fireEvent.change(await screen.findByLabelText('Premium period for quiet@example.com'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extend Premium for quiet@example.com' }));

    await waitFor(() => expect(setUserPlan).toHaveBeenCalledWith(1, 'premium', '2027-01-24T12:00:00.000Z'));
  });

  it('dismisses a request without touching the plan', async () => {
    const waiting = { ...free, premiumRequestedAt: '2026-10-16T09:00:00+00:00' };
    listAdminUsers.mockResolvedValue({ users: [waiting] });
    dismissPremiumRequest.mockResolvedValue({ user: free });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: "Dismiss quiet@example.com's Premium request" }));

    await waitFor(() => expect(dismissPremiumRequest).toHaveBeenCalledWith(1));
    expect(setUserPlan).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/Wants Premium/)).toBeNull());
  });

  it('says when a lapsed Premium plan ended', async () => {
    listAdminUsers.mockResolvedValue({ users: [{ ...free, planExpiresAt: '2026-10-01T00:00:00+00:00' }] });
    renderPage();

    expect(await screen.findByText(/^Premium ended/)).toBeTruthy();
  });
});
