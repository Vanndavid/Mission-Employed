import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NavTabKey } from '../types/auth';

/**
 * A hidden tab is gone from the sidebar, and its address sends a user to the
 * first tab they can see rather than to a screen nothing links to.
 */

let isAdmin = false;
let hiddenTabs: NavTabKey[] = [];

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin, hiddenTabs }),
}));

const { TabGate } = await import('./TabGate');

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/prep']}>
      <Routes>
        <Route path="/dashboard" element={<p>Mission Control</p>} />
        <Route path="/applications" element={<p>Job Applications</p>} />
        <Route
          path="/prep"
          element={
            <TabGate tab="training_room">
              <p>Training Room</p>
            </TabGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('TabGate', () => {
  it('shows the screen when the tab is not hidden', () => {
    isAdmin = false;
    hiddenTabs = [];
    renderAt();

    expect(screen.getByText('Training Room')).toBeTruthy();
  });

  it('sends a user to the first visible tab when it is hidden', () => {
    isAdmin = false;
    hiddenTabs = ['training_room', 'mission_control'];
    renderAt();

    expect(screen.getByText('Job Applications')).toBeTruthy();
    expect(screen.queryByText('Training Room')).toBeNull();
  });

  it('still lets an admin open a hidden tab', () => {
    isAdmin = true;
    hiddenTabs = ['training_room'];
    renderAt();

    expect(screen.getByText('Training Room')).toBeTruthy();
  });
});
