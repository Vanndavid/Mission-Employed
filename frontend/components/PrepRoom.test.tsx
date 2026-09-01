// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The prep room's non-audio behaviour. Recording itself needs MediaRecorder
 * and a real microphone permission, so the take-and-score path is left to the
 * hook; what is covered here is the wiring the redesign changed — the fact
 * bank reading the context directly, the question appearing before it is
 * spoken, and the gate applying to the drill alone.
 */

const store = {
  answers: [
    { themeId: 'weakness', bullets: ['Shipped the wrong migration', ''] },
    { themeId: 'challenge', bullets: [''] },
    { themeId: 'failure', bullets: [''] },
    { themeId: 'disagreement', bullets: [''] },
    { themeId: 'pressure', bullets: [''] },
    { themeId: 'impact', bullets: [''] },
  ],
  updateAnswer: vi.fn(),
  loading: false,
  saving: false,
  error: null as string | null,
  reload: vi.fn(),
};

let premium = true;

vi.mock('../contexts/DataProvider', () => ({
  useBehavioralAnswers: () => store,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: premium, user: null, isAdmin: false, logout: vi.fn() }),
}));

const generateBehavioralPrompt = vi.fn();
const textToSpeech = vi.fn();

vi.mock('../services/apiClient', () => ({
  generateBehavioralPrompt: (theme: string) => generateBehavioralPrompt(theme),
  processAudioResponse: vi.fn(),
  textToSpeech: (text: string) => textToSpeech(text),
}));

vi.mock('../utils/speech', () => ({ playSpokenClip: vi.fn().mockResolvedValue(undefined) }));

const { PrepRoom } = await import('./PrepRoom');

function renderPrepRoom() {
  return render(
    <MemoryRouter>
      <PrepRoom />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  premium = true;
  store.updateAnswer.mockClear();
  store.saving = false;
  generateBehavioralPrompt.mockReset().mockResolvedValue('"Tell me about a weakness."');
  textToSpeech.mockReset().mockResolvedValue('');
});

afterEach(cleanup);

describe('PrepRoom', () => {
  it('shows how many facts each theme has', () => {
    renderPrepRoom();

    expect(screen.getByText('1 fact')).toBeTruthy();
    expect(screen.getAllByText('No facts')).toHaveLength(5);
  });

  it('writes an edited fact back through the context', () => {
    renderPrepRoom();

    fireEvent.change(screen.getByLabelText('Worst Weakness fact 2'), { target: { value: 'X' } });

    expect(store.updateAnswer).toHaveBeenCalledWith('weakness', [
      'Shipped the wrong migration',
      'X',
    ]);
  });

  it('will not add a fact row while the last one is still blank', () => {
    renderPrepRoom();

    expect(screen.getByRole('button', { name: /add fact/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the question as soon as it arrives, without waiting on the audio', async () => {
    // A clip that never resolves: the question must still be readable.
    textToSpeech.mockReturnValue(new Promise(() => {}));
    renderPrepRoom();

    fireEvent.click(screen.getByRole('button', { name: /start drill/i }));

    await waitFor(() => expect(screen.getByText('Tell me about a weakness.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /record answer/i })).toBeTruthy();
  });

  it('surfaces a failed question request instead of hanging on the spinner', async () => {
    generateBehavioralPrompt.mockRejectedValue(new Error('upstream'));
    renderPrepRoom();

    fireEvent.click(screen.getByRole('button', { name: /start drill/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be reached/i));
    expect(screen.getByRole('button', { name: /start drill/i })).toBeTruthy();
  });

  it('warns when the selected theme has no facts to check against', () => {
    renderPrepRoom();

    fireEvent.click(screen.getByRole('button', { name: /Failure/ }));

    expect(screen.getByText(/cannot check your answer against anything real/i)).toBeTruthy();
  });

  it('gates the drill on Free but leaves the fact bank editable', () => {
    premium = false;
    renderPrepRoom();

    expect(screen.getByText(/Behavioral AI coach \(Premium\)/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start drill/i })).toBeNull();
    expect(screen.getByLabelText('Worst Weakness fact 1')).toBeTruthy();
  });
});
