import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NavTabKey } from '../types/auth';

/**
 * The admin's tab switches on Plans & limits. Each one saves at once and
 * sends the whole list, so the server never has to merge.
 */

const updateHiddenTabs = vi.fn();
const setHiddenTabs = vi.fn();
let hiddenTabs: NavTabKey[] = ['training_room'];

vi.mock('../services/authClient', () => ({
  updateHiddenTabs: (...args: unknown[]) => updateHiddenTabs(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ hiddenTabs, setHiddenTabs }),
}));

const { AdminTabsSection } = await import('./AdminTabsSection');
const { ToastProvider } = await import('./ToastProvider');

const renderSection = () =>
  render(
    <ToastProvider>
      <AdminTabsSection />
    </ToastProvider>,
  );

const toggle = (label: string) => screen.getByRole('checkbox', { name: `Show ${label} to users` }) as HTMLInputElement;

beforeEach(() => {
  hiddenTabs = ['training_room'];
  updateHiddenTabs.mockReset();
  setHiddenTabs.mockReset();
});

describe('AdminTabsSection', () => {
  it('ticks every tab users can see', () => {
    renderSection();

    expect(toggle('Training Room').checked).toBe(false);
    expect(toggle('Mission Control').checked).toBe(true);
    expect(toggle('Mock Test').checked).toBe(true);
  });

  it('saves the whole list when a tab is switched and applies the answer', async () => {
    updateHiddenTabs.mockResolvedValue({ hiddenTabs: ['training_room', 'mock_test'] });
    renderSection();

    fireEvent.click(toggle('Mock Test'));

    await waitFor(() => expect(setHiddenTabs).toHaveBeenCalledWith(['training_room', 'mock_test']));
    expect(updateHiddenTabs).toHaveBeenCalledWith(['training_room', 'mock_test']);
    expect(await screen.findByText(/Mock Test is hidden from users/)).toBeTruthy();
  });

  it('says so and changes nothing when the save fails', async () => {
    updateHiddenTabs.mockRejectedValue('offline');
    renderSection();

    fireEvent.click(toggle('Training Room'));

    expect(await screen.findByText(/Could not save the tabs/)).toBeTruthy();
    expect(updateHiddenTabs).toHaveBeenCalledWith([]);
    expect(setHiddenTabs).not.toHaveBeenCalled();
    expect(toggle('Training Room').checked).toBe(false);
  });
});
