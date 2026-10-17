import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PremiumGate } from './PremiumGate';
import { FeatureKey } from '../types/auth';

let premium = false;
let enabled: Partial<Record<FeatureKey, boolean>> | null = null;
let premiumHas: Partial<Record<FeatureKey, boolean>> = {};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: premium, user: null, isAdmin: false, logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock('../contexts/SubscriptionContext', async () => {
  const actual = await vi.importActual<typeof import('../contexts/SubscriptionContext')>(
    '../contexts/SubscriptionContext',
  );
  return {
    ...actual,
    useSubscription: () => ({
      canUse: (key: FeatureKey) => (enabled ? enabled[key] ?? false : premium),
      premiumIncludes: (key: FeatureKey) => premiumHas[key] ?? true,
      allowance: (key: FeatureKey) => ({ key, name: key === 'coding_tutor' ? 'AI coding tutor' : 'Coding problem generator' }),
    }),
  };
});

function renderGate(feature: FeatureKey | FeatureKey[] = 'coding_tutor') {
  return render(
    <MemoryRouter>
      <PremiumGate feature={feature} title="Coding practice">
        <button type="button">Generate problem</button>
      </PremiumGate>
    </MemoryRouter>,
  );
}

describe('PremiumGate', () => {
  beforeEach(() => {
    premium = false;
    enabled = null;
    premiumHas = {};
  });

  it('shows the upgrade prompt when the plan lacks a Premium feature, and hides the children', () => {
    renderGate();

    expect(screen.getByRole('heading', { name: 'Coding practice' })).toBeTruthy();
    expect(screen.getByText(/included with Premium/i)).toBeTruthy();
    expect(screen.getByText(/AI coding tutor/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /see plans/i })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('button', { name: 'Generate problem' })).toBeNull();
  });

  it('renders children when the plan includes the feature', () => {
    premium = true;
    renderGate();

    expect(screen.getByRole('button', { name: 'Generate problem' })).toBeTruthy();
    expect(screen.queryByText(/included with Premium/i)).toBeNull();
  });

  it('follows the admin’s configuration rather than the plan name', () => {
    // A free account the admin has given the tutor to.
    enabled = { coding_tutor: true };
    renderGate();

    expect(screen.getByRole('button', { name: 'Generate problem' })).toBeTruthy();
  });

  it('needs every feature it names', () => {
    enabled = { coding_tutor: true, coding_problem: false };
    renderGate(['coding_problem', 'coding_tutor']);

    expect(screen.queryByRole('button', { name: 'Generate problem' })).toBeNull();
    expect(screen.getByText(/Coding problem generator/)).toBeTruthy();
  });

  it('does not promise Premium for a feature switched off for everyone', () => {
    premium = true;
    enabled = { coding_tutor: false };
    premiumHas = { coding_tutor: false };
    renderGate();

    expect(screen.getByText(/not available on your plan/i)).toBeTruthy();
    expect(screen.queryByText(/included with Premium/i)).toBeNull();
  });
});
