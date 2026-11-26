import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../services/http';

/**
 * "Report this question", under a quiz verdict: a reason goes to an admin's
 * question bank. One open report per user per question.
 */

const reportQuestion = vi.fn();

vi.mock('../services/questionBankClient', () => ({
  reportQuestion: (...args: unknown[]) => reportQuestion(...args),
}));

const { ReportQuestion } = await import('./ReportQuestion');

beforeEach(() => {
  reportQuestion.mockReset().mockResolvedValue(undefined);
});

describe('ReportQuestion', () => {
  it('is a link until asked, then sends the reason', async () => {
    render(<ReportQuestion questionId={11} />);

    expect(screen.queryByLabelText(/What is wrong/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Report this question' }));

    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: '  The key should be B.  ' } });
    fireEvent.click(send);

    expect(await screen.findByText(/Thanks/)).toBeTruthy();
    expect(reportQuestion).toHaveBeenCalledWith(11, 'The key should be B.');
    expect(screen.queryByLabelText(/What is wrong/)).toBeNull();
  });

  it('says so when this user has already reported it', async () => {
    reportQuestion.mockRejectedValue(
      new ApiError(409, 'You have already reported this question. An admin will look at it.', 'already_reported'),
    );
    render(<ReportQuestion questionId={11} />);

    fireEvent.click(screen.getByRole('button', { name: 'Report this question' }));
    fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: 'Wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText(/already reported this question/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();
  });

  it('keeps the reason when sending fails, to try again', async () => {
    reportQuestion.mockRejectedValue(new ApiError(0, 'Could not reach the server. Is the API running?', 'network'));
    render(<ReportQuestion questionId={11} />);

    fireEvent.click(screen.getByRole('button', { name: 'Report this question' }));
    fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: 'Wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the server/);
    expect(screen.getByLabelText(/What is wrong/)).toHaveValue('Wrong');
  });

  it('can be cancelled', () => {
    render(<ReportQuestion questionId={11} />);

    fireEvent.click(screen.getByRole('button', { name: 'Report this question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Report this question' })).toBeTruthy();
    expect(reportQuestion).not.toHaveBeenCalled();
  });
});
