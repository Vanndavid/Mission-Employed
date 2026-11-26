import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeatureKey, NavTabKey } from '../types/auth';
import { progressFixture } from '../utils/practiceProgress.fixture';

/**
 * The coach card: the three weakest areas across the practice modes, each
 * with a one-click start, and only in modes the account can open.
 */

let isAdmin = false;
let hiddenTabs: NavTabKey[] = [];
let included: FeatureKey[] = ['code_review', 'system_design'];

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin, hiddenTabs }),
}));

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canUse: (feature: FeatureKey) => included.includes(feature) }),
}));

const { PracticeCoach } = await import('./PracticeCoach');

const renderCoach = (props: React.ComponentProps<typeof PracticeCoach>) =>
  render(
    <MemoryRouter>
      <PracticeCoach {...props} />
    </MemoryRouter>,
  );

const picks = () => within(screen.getByRole('list', { name: 'What to practise next' })).getAllByRole('listitem');

beforeEach(() => {
  isAdmin = false;
  hiddenTabs = [];
  included = ['code_review', 'system_design'];
});

describe('PracticeCoach', () => {
  it('ranks the weakest areas across modes, each with a one-click start', () => {
    renderCoach({ progress: progressFixture() });

    const [first, second, third] = picks();
    expect(picks()).toHaveLength(3);

    // Async: two recent misses, half of a two-topic round each.
    expect(within(first).getByText('JavaScript · Promises & async')).toBeTruthy();
    expect(within(first).getByText('0% on your last 2 answers')).toBeTruthy();
    expect(within(first).getByRole('link', { name: 'Start a round' }).getAttribute('href')).toBe(
      '/dashboard/quiz?language=javascript&topic=async',
    );
    expect(within(first).getByRole('link', { name: 'Retry 2 mistakes' }).getAttribute('href')).toBe(
      '/dashboard/quiz?language=javascript&topic=mistakes',
    );

    expect(within(second).getByText('JavaScript · Scope & closures')).toBeTruthy();

    expect(within(third).getByText('Bug issues')).toBeTruthy();
    expect(within(third).getByRole('link', { name: 'Start a review' }).getAttribute('href')).toBe('/dashboard/code-review?category=bug');
  });

  it('suggests a mode never tried once the weak areas run out', () => {
    const progress = progressFixture();
    progress.quiz.languages[0].topics = progress.quiz.languages[0].topics.slice(0, 1);
    renderCoach({ progress });

    const last = picks()[2];
    expect(within(last).getByText('System design')).toBeTruthy();
    expect(within(last).getByText('Not tried yet.')).toBeTruthy();
    expect(within(last).getByRole('link', { name: 'Try it' }).getAttribute('href')).toBe('/dashboard/system-design');
  });

  it('leaves out modes the plan does not include or an admin has hidden', () => {
    included = [];
    hiddenTabs = [];
    renderCoach({ progress: progressFixture() });

    expect(picks()).toHaveLength(2);
    expect(screen.queryByText('Bug issues')).toBeNull();
    expect(screen.queryByText('System design')).toBeNull();
  });

  it('says so when there is nothing to go on yet', () => {
    hiddenTabs = ['practice_quiz'];
    included = [];
    renderCoach({ progress: progressFixture() });

    expect(screen.queryByRole('list', { name: 'What to practise next' })).toBeNull();
    expect(screen.getByText(/Nothing to suggest yet/)).toBeTruthy();
  });

  it('shows loading and a failed load quietly', () => {
    const { unmount } = renderCoach({ progress: null, loading: true });
    expect(screen.getByText('Working out what to practise…')).toBeTruthy();
    unmount();

    renderCoach({ progress: null, error: 'Could not load your practice progress.' });
    expect(screen.getByText('Could not load your practice progress.')).toBeTruthy();
  });

  it('links to the practice history', () => {
    renderCoach({ progress: progressFixture() });

    expect(screen.getByRole('link', { name: 'Practice history' }).getAttribute('href')).toBe('/dashboard/history');
  });
});
