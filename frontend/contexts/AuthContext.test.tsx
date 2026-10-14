import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const fetchMe = vi.fn();
const updatePreferences = vi.fn();

vi.mock('../services/authClient', () => ({
  fetchMe: () => fetchMe(),
  updatePreferences: (...args: unknown[]) => updatePreferences(...args),
  getStoredToken: () => 'token',
  setStoredToken: vi.fn(),
  loginAccount: vi.fn(),
  logoutAccount: vi.fn(),
  registerAccount: vi.fn(),
}));

const { AuthProvider, useAuth } = await import('./AuthContext');

const ME = {
  id: 1,
  email: 'me@example.test',
  role: 'user',
  plan: 'free',
  createdAt: '2026-10-01T00:00:00Z',
  deactivatedAt: null,
  preferences: { applicationsPageSize: 5 },
};

let saveResult: Promise<void> | undefined;

function PageSize() {
  const { user, updatePreferences: save } = useAuth();
  if (!user) return null;

  return (
    <>
      <p>Rows: {user.preferences.applicationsPageSize}</p>
      <button
        onClick={() => {
          saveResult = save({ applicationsPageSize: 25 });
          saveResult.catch(() => undefined);
        }}
      >
        Save 25
      </button>
    </>
  );
}

const renderSignedIn = async () => {
  render(
    <AuthProvider>
      <PageSize />
    </AuthProvider>,
  );
  await screen.findByText('Rows: 5');
};

beforeEach(() => {
  saveResult = undefined;
  fetchMe.mockReset().mockResolvedValue({ user: ME });
  updatePreferences.mockReset();
});

describe('AuthContext preferences', () => {
  it('applies a preference straight away and saves it on the account', async () => {
    let resolve!: () => void;
    updatePreferences.mockReturnValue(new Promise<void>(r => (resolve = r)));
    await renderSignedIn();

    fireEvent.click(screen.getByRole('button', { name: 'Save 25' }));

    // Before the server has answered.
    expect(screen.getByText('Rows: 25')).toBeTruthy();
    expect(updatePreferences).toHaveBeenCalledWith({ applicationsPageSize: 25 });

    await act(async () => {
      resolve();
      await saveResult;
    });
    expect(screen.getByText('Rows: 25')).toBeTruthy();
  });

  it('keeps the choice for this session when the save fails, and reports it', async () => {
    updatePreferences.mockRejectedValue(new Error('offline'));
    await renderSignedIn();

    fireEvent.click(screen.getByRole('button', { name: 'Save 25' }));

    await expect(saveResult).rejects.toThrow('offline');
    expect(screen.getByText('Rows: 25')).toBeTruthy();
  });
});
