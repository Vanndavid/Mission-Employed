import { NavTabKey } from '../types/auth';

/**
 * The feature tabs, in sidebar order: the ones an admin can hide from users
 * (App\Enums\NavTab). Plan & Usage, Settings and the admin pages are not
 * here; they cannot be hidden and sit apart, beside Log out.
 *
 * Some tabs are modes of another: Quiz is a mode of Mission Control, drawn
 * as a mode tab on that screen (ModeTabs) rather than in the sidebar, but
 * hidden by an admin like any tab. A new mode is a NavTab case, an entry
 * here with `modeOf`, and a child route under its tab's path in App.tsx.
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
  /** On a mode: the tab whose screen it is a mode of. */
  modeOf?: NavTabKey;
  /** On a tab with modes: what its own screen is called among them. */
  modeLabel?: string;
}

export const NAV_TABS: NavTab[] = [
  {
    key: 'mission_control',
    path: '/dashboard',
    label: 'Mission Control',
    sub: 'Coding Practice',
    icon: '🚀',
    // Lit on its modes' paths too.
    end: false,
    modeLabel: 'Problems',
  },
  {
    key: 'practice_quiz',
    modeOf: 'mission_control',
    path: '/dashboard/quiz',
    label: 'Quiz',
    sub: 'Language quizzes',
    icon: '❓',
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
  {
    key: 'practice_code_review',
    modeOf: 'mission_control',
    path: '/dashboard/code-review',
    label: 'Code review',
    sub: 'Review a snippet like a PR',
    icon: '🔍',
    end: true,
  },
  {
    key: 'practice_system_design',
    modeOf: 'mission_control',
    path: '/dashboard/system-design',
    label: 'System design',
    sub: 'Rubric-scored designs',
    icon: '🏗️',
    end: true,
  },
];

/** Where Plan & Usage lives: home when every feature tab is hidden. */
const FALLBACK_HOME = '/account';

/** A tab's own screen and then its modes, in order. */
function screensOf(tab: NavTab): NavTab[] {
  return [tab, ...NAV_TABS.filter(t => t.modeOf === tab.key)];
}

/**
 * The entries this account's sidebar draws: the tabs that are not modes.
 * A user does not get a hidden one; an admin gets them all, the hidden ones
 * marked, so what was hidden can still be checked. A tab with modes counts
 * as hidden only when all of its screens are, and a user's link goes to the
 * first screen they can see: Mission Control leads to Quiz when Problems is
 * hidden.
 */
export function sidebarTabs(hidden: NavTabKey[], isAdmin: boolean): (NavTab & { hidden: boolean })[] {
  return NAV_TABS.filter(tab => !tab.modeOf).flatMap(tab => {
    const visible = screensOf(tab).filter(screen => !hidden.includes(screen.key));
    const allHidden = visible.length === 0;

    if (allHidden && !isAdmin) return [];

    return [{ ...tab, path: isAdmin || allHidden ? tab.path : visible[0].path, hidden: allHidden }];
  });
}

export interface ModeTab {
  key: NavTabKey;
  path: string;
  label: string;
  hidden: boolean;
}

/**
 * The mode tabs drawn on a tab's screen: its own screen (as modeLabel) and
 * its modes. Hidden ones are left out for a user and marked for an admin.
 * Empty for a tab that has no modes.
 */
export function modeTabs(key: NavTabKey, hidden: NavTabKey[], isAdmin: boolean): ModeTab[] {
  const tab = NAV_TABS.find(t => t.key === key);
  if (!tab || !NAV_TABS.some(t => t.modeOf === key)) return [];

  return screensOf(tab)
    .map(screen => ({
      key: screen.key,
      path: screen.path,
      label: screen === tab ? (tab.modeLabel ?? tab.label) : screen.label,
      hidden: hidden.includes(screen.key),
    }))
    .filter(mode => isAdmin || !mode.hidden);
}

/** A tab's name where it stands alone, as on the admin's tab switches. */
export function screenLabel(tab: NavTab): string {
  if (tab.modeOf) {
    const parent = NAV_TABS.find(t => t.key === tab.modeOf);
    return parent ? `${parent.label} · ${tab.label}` : tab.label;
  }
  return tab.modeLabel ? `${tab.label} · ${tab.modeLabel}` : tab.label;
}

/** The first tab the account can see: where `/` and a hidden tab's address lead. */
export function homePath(hidden: NavTabKey[], isAdmin: boolean): string {
  return sidebarTabs(hidden, isAdmin)[0]?.path ?? FALLBACK_HOME;
}
