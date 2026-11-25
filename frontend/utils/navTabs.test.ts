import { describe, expect, it } from 'vitest';
import { homePath, modeTabs, NAV_TABS, screenLabel, sidebarTabs } from './navTabs';

/**
 * The feature tabs an admin can hide. A user does not see a hidden one; an
 * admin sees every tab, with the hidden ones marked, so they can still check
 * what they hid.
 *
 * A mode (Quiz) is a tab too, drawn as a mode tab on the screen it belongs
 * to (Mission Control) rather than in the sidebar.
 */

const sidebarKeys = NAV_TABS.filter(t => !t.modeOf).map(t => t.key);

describe('sidebarTabs', () => {
  it('leaves out the hidden tabs for a user', () => {
    const keys = sidebarTabs(['training_room', 'mock_test'], false).map(t => t.key);

    expect(keys).toEqual(['mission_control', 'applications', 'profile']);
  });

  it('keeps every tab for an admin and marks the hidden ones', () => {
    const tabs = sidebarTabs(['training_room'], true);

    expect(tabs.map(t => t.key)).toEqual(sidebarKeys);
    expect(tabs.filter(t => t.hidden).map(t => t.key)).toEqual(['training_room']);
  });

  it('never lists a mode in the sidebar', () => {
    expect(sidebarTabs([], true).map(t => t.key)).not.toContain('practice_quiz');
  });

  it('keeps Mission Control while any of its modes is visible, linking to the first', () => {
    const [user] = sidebarTabs(['mission_control'], false);
    expect(user.key).toBe('mission_control');
    expect(user.path).toBe('/dashboard/quiz');
    expect(user.hidden).toBe(false);

    expect(sidebarTabs(['mission_control', 'practice_quiz'], false)[0].key).toBe('applications');
  });

  it('marks Mission Control hidden for an admin only when every mode is', () => {
    expect(sidebarTabs(['mission_control'], true)[0]).toMatchObject({ path: '/dashboard', hidden: false });
    expect(sidebarTabs(['mission_control', 'practice_quiz'], true)[0]).toMatchObject({ path: '/dashboard', hidden: true });
  });
});

describe('modeTabs', () => {
  it("lists a tab's own screen and its modes", () => {
    expect(modeTabs('mission_control', [], false).map(m => [m.label, m.path])).toEqual([
      ['Problems', '/dashboard'],
      ['Quiz', '/dashboard/quiz'],
    ]);
  });

  it('leaves out a hidden mode for a user and marks it for an admin', () => {
    expect(modeTabs('mission_control', ['practice_quiz'], false).map(m => m.key)).toEqual(['mission_control']);

    const admin = modeTabs('mission_control', ['practice_quiz'], true);
    expect(admin.map(m => [m.key, m.hidden])).toEqual([
      ['mission_control', false],
      ['practice_quiz', true],
    ]);
  });

  it('is empty for a tab with no modes', () => {
    expect(modeTabs('applications', [], true)).toEqual([]);
  });
});

describe('screenLabel', () => {
  it('names a mode with the tab it belongs to', () => {
    const label = (key: string) => screenLabel(NAV_TABS.find(t => t.key === key)!);

    expect(label('mission_control')).toBe('Mission Control · Problems');
    expect(label('practice_quiz')).toBe('Mission Control · Quiz');
    expect(label('applications')).toBe('Job Applications');
  });
});

describe('homePath', () => {
  it('is the first tab the account can see', () => {
    expect(homePath([], false)).toBe('/dashboard');
    expect(homePath(['mission_control'], false)).toBe('/dashboard/quiz');
    expect(homePath(['mission_control', 'practice_quiz'], false)).toBe('/applications');
    expect(homePath(['mission_control', 'practice_quiz'], true)).toBe('/dashboard');
  });

  it('falls back to Plan & Usage when every feature tab is hidden', () => {
    expect(homePath(NAV_TABS.map(t => t.key), false)).toBe('/account');
  });
});
