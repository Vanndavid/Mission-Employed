import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/** Mission Control's frame names every practice mode and links to the history. */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false, hiddenTabs: [] }),
}));

const { MissionControl } = await import('./MissionControl');

describe('MissionControl', () => {
  it('says what each mode is, and links to progress and history', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MissionControl />
      </MemoryRouter>,
    );

    const subtitle = screen.getByText(/Software engineering practice/).textContent ?? '';
    for (const mode of ['AI tutor', 'quizzes', 'code reviews', 'system designs']) {
      expect(subtitle).toContain(mode);
    }
    expect(screen.getByRole('link', { name: 'Progress & history' }).getAttribute('href')).toBe('/dashboard/history');
  });
});
