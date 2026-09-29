import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AtsReport, JobApplication, JobStatus } from '../types';
import { ApiError } from '../services/http';

/**
 * The ATS panel in the application drawer and the badge in the table. The
 * score itself is the server's; what is covered here is that the report reads
 * the way the server meant it (required gaps first, stale shown), that the
 * check is sent for the CV the user picked, and that a refusal says why.
 */

let premium = true;
const refreshUser = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: premium, user: null, isAdmin: false, logout: vi.fn(), refreshUser }),
}));

const { AtsScorePanel, AtsBadge, atsBand } = await import('./AtsScore');

const REPORT: AtsReport = {
  score: 68,
  keywords: { matched: 2, total: 5 },
  matched: [
    { term: 'PHP', kind: 'skill', required: true },
    { term: 'Laravel', kind: 'skill', required: false },
  ],
  missing: [
    { term: 'Kubernetes', kind: 'skill', required: true },
    { term: 'AWS Certified', kind: 'qualification', required: true },
    { term: 'GraphQL', kind: 'skill', required: false },
  ],
  checks: [
    { id: 'contact', label: 'Contact details', passed: true, detail: 'Email address and phone number found.' },
    { id: 'sections', label: 'Standard sections', passed: false, detail: 'No Education heading found.' },
    { id: 'title', label: 'Job title', passed: true, detail: 'Your CV names the role.' },
    { id: 'length', label: 'Length', passed: true, detail: '540 words.' },
    { id: 'measurable', label: 'Measurable results', passed: false, detail: 'Only 1 quantified result found.' },
  ],
  source: 'tailored',
  checkedAt: '2026-09-29T10:00:00.000Z',
  stale: false,
};

function app(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 5,
    company: 'Acme',
    role: 'Backend Engineer',
    url: '',
    source: '',
    dateApplied: '2026-09-01',
    status: JobStatus.APPLIED,
    isImportant: false,
    notes: '',
    jobDescription: 'PHP, Kubernetes, GraphQL.',
    coverLetter: '',
    tailoredCV: 'A tailored CV.',
    interviewStages: [],
    nextAction: '',
    nextActionDue: '',
    recruiterContact: null,
    takeHome: null,
    offer: null,
    atsReport: null,
    ...overrides,
  };
}

function panel(props: Partial<React.ComponentProps<typeof AtsScorePanel>> = {}) {
  const onCheck = props.onCheck ?? vi.fn(async () => REPORT);
  render(
    <MemoryRouter>
      <AtsScorePanel app={app()} hasBaseCv onCheck={onCheck} {...props} />
    </MemoryRouter>,
  );
  return onCheck;
}

beforeEach(() => {
  premium = true;
  refreshUser.mockReset();
});

describe('AtsScorePanel', () => {
  it('reads out a report: score, the gaps with required first, and each check', () => {
    panel({ app: app({ atsReport: REPORT }) });

    expect(screen.getByLabelText('ATS score 68 out of 100')).toHaveTextContent('Fair');
    expect(screen.getByText(/2 of 5/)).toBeInTheDocument();

    const missing = within(screen.getByRole('list', { name: 'Missing keywords' })).getAllByRole('listitem');
    expect(missing.map(item => item.textContent)).toEqual([
      'Kubernetesrequired',
      'AWS Certifiedrequired',
      'GraphQL',
    ]);

    const checks = within(screen.getByRole('list', { name: 'Format checks' })).getAllByRole('listitem');
    expect(checks).toHaveLength(5);
    expect(checks[1]).toHaveTextContent('Standard sections failed');
    expect(checks[1]).toHaveTextContent('No Education heading found.');

    // Matched keywords are there, but folded away.
    expect(screen.queryByRole('list', { name: 'Matched keywords' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Matched \(2\)/ }));
    expect(within(screen.getByRole('list', { name: 'Matched keywords' })).getAllByRole('listitem')).toHaveLength(2);

    expect(screen.queryByText(/changed since this check/)).not.toBeInTheDocument();
  });

  it('says so when the report no longer describes the CV or the job', () => {
    panel({ app: app({ atsReport: { ...REPORT, stale: true } }) });

    expect(screen.getByText(/changed since this check/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeEnabled();
  });

  it('checks the tailored CV by default and the base CV when picked', async () => {
    const onCheck = panel();

    fireEvent.click(screen.getByRole('button', { name: 'Check score' }));
    await waitFor(() => expect(onCheck).toHaveBeenCalledWith('tailored'));
    // The picker is locked while a check runs.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check score' })).toBeEnabled());

    fireEvent.click(screen.getByRole('radio', { name: 'Base CV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check score' }));
    await waitFor(() => expect(onCheck).toHaveBeenLastCalledWith('base'));
  });

  it('offers only the CVs that exist', () => {
    panel({ app: app({ tailoredCV: '' }) });

    expect(screen.getByRole('radio', { name: 'Tailored CV' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Base CV' })).toHaveAttribute('aria-checked', 'true');
  });

  it('cannot check without a job description or any CV', () => {
    panel({ app: app({ jobDescription: '  ' }) });
    expect(screen.getByRole('button', { name: 'Check score' })).toBeDisabled();
    expect(screen.getByText(/no job description/i)).toBeInTheDocument();
  });

  it('cannot check with no CV at all', () => {
    panel({ app: app({ tailoredCV: '' }), hasBaseCv: false });
    expect(screen.getByRole('button', { name: 'Check score' })).toBeDisabled();
    expect(screen.getByText(/CV & Profile/)).toBeInTheDocument();
  });

  it('shows why the server refused', async () => {
    panel({
      onCheck: vi.fn(async () => {
        throw new ApiError(422, 'The given data was invalid.', undefined, {
          jobDescription: ['No skills or qualifications could be read from this job description.'],
        });
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Check score' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No skills or qualifications could be read');
  });

  it('turns an unreachable model into a sentence, not a status code', async () => {
    panel({
      onCheck: vi.fn(async () => {
        throw new ApiError(502, 'The AI service is unavailable right now.', 'ai_unavailable');
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Check score' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not answering right now/);
  });

  it('re-reads the plan when the server says the account is not premium', async () => {
    panel({
      onCheck: vi.fn(async () => {
        throw new ApiError(403, 'This feature requires a premium plan.', 'premium_required');
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Check score' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Premium/);
    expect(refreshUser).toHaveBeenCalled();
  });

  it('shows the upgrade prompt to a free account', () => {
    premium = false;
    panel({ app: app({ atsReport: REPORT }) });

    expect(screen.getByText('ATS score (Premium)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
  });
});

describe('AtsBadge', () => {
  it('shows the score, and nothing without a report', () => {
    const { container, rerender } = render(<AtsBadge report={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AtsBadge report={REPORT} />);
    expect(screen.getByText('ATS 68')).toHaveAttribute('title', 'ATS score 68/100 (Fair)');

    rerender(<AtsBadge report={{ ...REPORT, stale: true }} />);
    expect(screen.getByText('ATS 68')).toHaveAttribute('title', expect.stringContaining('changed since'));
  });
});

describe('atsBand', () => {
  it('splits at 50 and 75', () => {
    expect([0, 49, 50, 74, 75, 100].map(score => atsBand(score).label)).toEqual([
      'Weak', 'Weak', 'Fair', 'Fair', 'Strong', 'Strong',
    ]);
  });
});
