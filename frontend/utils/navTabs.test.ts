import { describe, expect, it } from 'vitest';
import { homePath, NAV_TABS, sidebarTabs } from './navTabs';

/**
 * The feature tabs an admin can hide. A user does not see a hidden one; an
 * admin sees every tab, with the hidden ones marked, so they can still check
 * what they hid.
 */

describe('sidebarTabs', () => {
  it('leaves out the hidden tabs for a user', () => {
    const keys = sidebarTabs(['training_room', 'mock_test'], false).map(t => t.key);

    expect(keys).toEqual(['mission_control', 'applications', 'profile']);
  });

  it('keeps every tab for an admin and marks the hidden ones', () => {
    const tabs = sidebarTabs(['training_room'], true);

    expect(tabs.map(t => t.key)).toEqual(NAV_TABS.map(t => t.key));
    expect(tabs.filter(t => t.hidden).map(t => t.key)).toEqual(['training_room']);
  });
});

describe('homePath', () => {
  it('is the first tab the account can see', () => {
    expect(homePath([], false)).toBe('/dashboard');
    expect(homePath(['mission_control'], false)).toBe('/applications');
    expect(homePath(['mission_control'], true)).toBe('/dashboard');
  });

  it('falls back to Plan & Usage when every feature tab is hidden', () => {
    expect(homePath(NAV_TABS.map(t => t.key), false)).toBe('/account');
  });
});
