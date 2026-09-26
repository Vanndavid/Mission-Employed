import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The admin screen's usage columns: each user's tokens and estimated cost over
 * the chosen window, all-time cost, and a per-feature breakdown on request.
 */

const listAdminUsers = vi.fn();
const fetchAdminUsage = vi.fn();

vi.mock('../services/authClient', () => ({
  listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
  fetchAdminUsage: (...args: unknown[]) => fetchAdminUsage(...args),
  setUserPlan: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
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
      { id: 1, email: 'quiet@example.com', role: 'user', plan: 'free', createdAt: '' },
      { id: 2, email: 'heavy@example.com', role: 'user', plan: 'premium', createdAt: '' },
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
