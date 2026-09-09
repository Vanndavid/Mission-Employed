import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PremiumGate } from './PremiumGate';
import { PREMIUM_FEATURES } from '../types/auth';

let premium = false;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: premium, user: null, isAdmin: false, logout: vi.fn() }),
}));

function renderGate() {
  return render(
    <MemoryRouter>
      <PremiumGate title="Coding practice">
        <button type="button">Generate problem</button>
      </PremiumGate>
    </MemoryRouter>,
  );
}

describe('PremiumGate', () => {
  beforeEach(() => {
    premium = false;
  });

  it('shows the upgrade prompt to a free user and hides the gated children', () => {
    renderGate();

    expect(screen.getByRole('heading', { name: 'Coding practice' })).toBeTruthy();
    expect(screen.getByText(/locked on Free/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view account plan/i })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('button', { name: 'Generate problem' })).toBeNull();

    for (const feature of PREMIUM_FEATURES.slice(0, 4)) {
      expect(screen.getByText(feature, { exact: false })).toBeTruthy();
    }
  });

  it('renders children when the account is premium', () => {
    premium = true;
    renderGate();

    expect(screen.getByRole('button', { name: 'Generate problem' })).toBeTruthy();
    expect(screen.queryByText(/locked on Free/i)).toBeNull();
  });
});
