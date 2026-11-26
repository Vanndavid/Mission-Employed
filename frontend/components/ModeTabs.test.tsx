import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavTabKey } from '../types/auth';

/**
 * The mode tabs on Mission Control: Problems and Quiz, each a tab an admin
 * can hide like any other.
 */

let isAdmin = false;
let hiddenTabs: NavTabKey[] = [];

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin, hiddenTabs }),
}));

const { ModeTabs } = await import('./ModeTabs');

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ModeTabs tab="mission_control" />
    </MemoryRouter>,
  );

const modes = () => within(screen.getByRole('navigation', { name: 'Mission Control modes' }));

beforeEach(() => {
  isAdmin = false;
  hiddenTabs = [];
});

describe('ModeTabs', () => {
  it('links each mode and marks the one on screen', () => {
    renderAt('/dashboard/quiz');

    expect(modes().getByRole('link', { name: 'Problems' })).toHaveAttribute('href', '/dashboard');
    expect(modes().getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page');
    expect(modes().getByRole('link', { name: 'Problems' })).not.toHaveAttribute('aria-current');
  });

  it('draws nothing when a user can see only one mode', () => {
    hiddenTabs = ['practice_quiz', 'practice_system_design'];
    renderAt('/dashboard');

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows an admin a hidden mode, marked', () => {
    isAdmin = true;
    hiddenTabs = ['practice_quiz'];
    renderAt('/dashboard');

    expect(within(modes().getByRole('link', { name: /Quiz/ })).getByText('Hidden')).toBeTruthy();
  });
});
