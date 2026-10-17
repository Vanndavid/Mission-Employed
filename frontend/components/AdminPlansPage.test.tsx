import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanInfo } from '../types/auth';

/**
 * The admin plan editor: plans across, features down. A save sends each plan
 * that changed, whole, and nothing for a plan that did not.
 */

const fetchAdminPlans = vi.fn();
const updateAdminPlan = vi.fn();
let isAdmin = true;

vi.mock('../services/subscriptionClient', () => ({
  fetchAdminPlans: (...args: unknown[]) => fetchAdminPlans(...args),
  updateAdminPlan: (...args: unknown[]) => updateAdminPlan(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin, isPremium: true, user: { id: 9 }, refreshUser: vi.fn() }),
}));

const { AdminPlansPage } = await import('./AdminPlansPage');
const { ToastProvider } = await import('./ToastProvider');

const plans: PlanInfo[] = [
  {
    key: 'free',
    name: 'Free',
    priceLabel: null,
    description: 'The tracker.',
    requestsPerMinute: 10,
    features: [
      { key: 'ats_check', enabled: false, limit: 5, period: 'month' },
      { key: 'seek_jobs', enabled: true, limit: 100, period: 'day' },
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    priceLabel: null,
    description: 'Every AI tool.',
    requestsPerMinute: 30,
    features: [
      { key: 'ats_check', enabled: true, limit: 50, period: 'day' },
      { key: 'seek_jobs', enabled: true, limit: 300, period: 'day' },
    ],
  },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AdminPlansPage />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  isAdmin = true;
  fetchAdminPlans.mockReset().mockResolvedValue({
    features: [
      { key: 'ats_check', name: 'ATS score check', description: 'Scores a CV.', group: 'Job applications' },
      { key: 'seek_jobs', name: 'Seek job search', description: 'Live listings.', group: 'Job applications' },
    ],
    plans,
  });
  updateAdminPlan.mockReset().mockImplementation(async (key: string, patch: Record<string, unknown>) => ({
    plan: { ...plans.find(p => p.key === key)!, ...patch, features: plans.find(p => p.key === key)!.features },
  }));
});

describe('AdminPlansPage', () => {
  it('lays every feature out against every plan', async () => {
    renderPage();

    expect(await screen.findByLabelText('ATS score check on Free')).not.toBeChecked();
    expect(screen.getByLabelText('ATS score check on Premium')).toBeChecked();
    expect(screen.getByLabelText('ATS score check limit on Premium')).toHaveValue('50');
    expect(screen.getByLabelText('premium requests per minute')).toHaveValue('30');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('opens a feature to Free with a weekly limit and saves only that plan', async () => {
    renderPage();

    fireEvent.click(await screen.findByLabelText('ATS score check on Free'));
    fireEvent.change(screen.getByLabelText('ATS score check limit on Free'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('ATS score check period on Free'), { target: { value: 'week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateAdminPlan).toHaveBeenCalledTimes(1));
    expect(updateAdminPlan).toHaveBeenCalledWith('free', {
      name: 'Free',
      priceLabel: null,
      description: 'The tracker.',
      requestsPerMinute: 10,
      features: {
        ats_check: { enabled: true, limit: 3, period: 'week' },
        seek_jobs: { enabled: true, limit: 100, period: 'day' },
      },
    });
  });

  it('saves a blank limit as unlimited and a price label as text', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Seek job search limit on Premium'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('premium price label'), { target: { value: '$9 / month' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateAdminPlan).toHaveBeenCalled());
    const [, patch] = updateAdminPlan.mock.calls[0];
    expect(patch.priceLabel).toBe('$9 / month');
    expect(patch.features.seek_jobs).toEqual({ enabled: true, limit: null, period: 'day' });
  });

  it('refuses a limit of zero before sending anything', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('ATS score check limit on Premium'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/ATS score check: the limit must be a whole number/)).toBeTruthy();
    expect(updateAdminPlan).not.toHaveBeenCalled();
  });

  it('puts an edit back with Discard', async () => {
    renderPage();

    fireEvent.click(await screen.findByLabelText('Seek job search on Free'));
    expect(screen.getByText(/Unsaved changes to Free/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('Seek job search on Free')).toBeChecked();
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
  });

  it('sends a non-admin back to their account', () => {
    isAdmin = false;
    renderPage();

    expect(fetchAdminPlans).not.toHaveBeenCalled();
    expect(screen.queryByText('Admin · Plans & limits')).toBeNull();
  });
});
