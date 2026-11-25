import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavTabKey } from '../types/auth';

/**
 * The sidebar: the feature tabs an admin has not hidden, and, apart from
 * them beside Log out, the pages nobody needs every day.
 */

let isAdmin = false;
let hiddenTabs: NavTabKey[] = [];

vi.mock('../services/apiClient', () => ({
  checkHealth: () => Promise.resolve({ status: 'ok' }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'me@example.test' },
    isPremium: false,
    isAdmin,
    hiddenTabs,
    logout: vi.fn(),
  }),
}));

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canUse: () => false }),
}));

const { Sidebar } = await import('./Sidebar');

const renderSidebar = (at = '/') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Sidebar mobileOpen={false} onMobileClose={vi.fn()} />
    </MemoryRouter>,
  );

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const account = () => within(screen.getByRole('navigation', { name: 'Account' }));

beforeEach(() => {
  isAdmin = false;
  hiddenTabs = [];
});

describe('Sidebar', () => {
  it('leaves a hidden tab out for a user', () => {
    hiddenTabs = ['training_room'];
    renderSidebar();

    expect(main().queryByRole('link', { name: /Training Room/ })).toBeNull();
    expect(main().getByRole('link', { name: /Mission Control/ })).toBeTruthy();
    expect(main().getByRole('link', { name: /Mock Test/ })).toBeTruthy();
  });

  it('shows an admin the hidden tab, marked as hidden from users', () => {
    isAdmin = true;
    hiddenTabs = ['training_room'];
    renderSidebar();

    const link = main().getByRole('link', { name: /Training Room/ });
    expect(within(link).getByText('Hidden from users')).toBeTruthy();
    expect(within(main().getByRole('link', { name: /Mock Test/ })).queryByText('Hidden from users')).toBeNull();
  });

  it('draws Quiz as a mode of Mission Control, not a sidebar entry, and keeps Mission Control lit on it', () => {
    renderSidebar('/dashboard/quiz');

    expect(main().queryByRole('link', { name: /Quiz/ })).toBeNull();
    expect(main().getByRole('link', { name: /Mission Control/ })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Plan & Usage and Settings beside Log out, not among the features', () => {
    renderSidebar();

    expect(main().queryByRole('link', { name: /Plan & Usage/ })).toBeNull();
    expect(main().queryByRole('link', { name: /Settings/ })).toBeNull();
    expect(account().getByRole('link', { name: /Plan & Usage/ })).toBeTruthy();
    expect(account().getByRole('link', { name: /Settings/ })).toBeTruthy();
    expect(account().getByRole('button', { name: 'Log out' })).toBeTruthy();
  });
});
