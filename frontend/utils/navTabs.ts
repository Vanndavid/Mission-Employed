import { NavTabKey } from '../types/auth';

/**
 * The feature tabs, in sidebar order: the ones an admin can hide from users
 * (App\Enums\NavTab). Plan & Usage, Settings and the admin pages are not
 * here; they cannot be hidden and sit apart, beside Log out.
 *
 * Hiding a tab declutters the sidebar and nothing more. The features behind
 * it are still governed by the plan, so an MCP client keeps them.
 */
export interface NavTab {
  key: NavTabKey;
  path: string;
  label: string;
  sub: string;
  icon: string;
  /** NavLink `end`: false keeps the tab lit on the paths below it. */
  end: boolean;
}

export const NAV_TABS: NavTab[] = [
  {
    key: 'mission_control',
    path: '/dashboard',
    label: 'Mission Control',
    sub: 'Coding Practice',
    icon: '🚀',
    end: true,
  },
  {
    key: 'applications',
    path: '/applications',
    label: 'Job Applications',
    sub: 'Mechanical Applying',
    icon: '📁',
    end: true,
  },
  {
    key: 'profile',
    path: '/applications/profile',
    label: 'CV & Profile',
    sub: 'Frozen Documents',
    icon: '📄',
    end: false,
  },
  {
    key: 'training_room',
    path: '/prep',
    label: 'Training Room',
    sub: 'Behavioral Drills',
    icon: '🧠',
    end: true,
  },
  {
    key: 'mock_test',
    path: '/mock',
    label: 'Mock Test',
    sub: 'Conversational Sim',
    icon: '👔',
    end: true,
  },
];

/** Where Plan & Usage lives: home when every feature tab is hidden. */
const FALLBACK_HOME = '/account';

/**
 * The tabs this account's sidebar draws. A user does not get the hidden
 * ones; an admin gets them all, the hidden ones marked, so what was hidden
 * can still be checked.
 */
export function sidebarTabs(hidden: NavTabKey[], isAdmin: boolean): (NavTab & { hidden: boolean })[] {
  return NAV_TABS.map(tab => ({
    ...tab,
    hidden: hidden.includes(tab.key),
  })).filter(tab => isAdmin || !tab.hidden);
}

/** The first tab the account can see: where `/` and a hidden tab's address lead. */
export function homePath(hidden: NavTabKey[], isAdmin: boolean): string {
  return sidebarTabs(hidden, isAdmin)[0]?.path ?? FALLBACK_HOME;
}
