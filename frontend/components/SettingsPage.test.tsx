import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { SettingsPage } from './SettingsPage';

/**
 * The colour theme and light/dark mode, moved off the sidebar into Settings.
 * Both are device preferences: they apply to the page at once and are kept
 * in localStorage, not on the account.
 */

const renderSettings = () =>
  render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );

const pressed = (name: string | RegExp) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

beforeEach(() => {
  // jsdom has no matchMedia; with nothing stored the mode follows the system.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('shows the stored theme and mode as selected', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('theme_palette', 'ember');

    renderSettings();

    expect(pressed(/Ember/)).toBe('true');
    expect(pressed(/Forest/)).toBe('false');
    expect(pressed('Dark')).toBe('true');
    expect(pressed('Light')).toBe('false');
  });

  it('switches to dark mode and remembers it', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(pressed('Dark')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('switches the colour theme and remembers it', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Ocean/ }));

    expect(document.documentElement.dataset.palette).toBe('ocean');
    expect(localStorage.getItem('theme_palette')).toBe('ocean');
    expect(pressed(/Ocean/)).toBe('true');
  });
});
