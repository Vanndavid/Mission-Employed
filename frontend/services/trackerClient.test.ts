import { describe, it, expect } from 'vitest';
import { toApplicationPayload, toStagePayload } from './trackerClient';
import { JobStatus } from '../types';

describe('toApplicationPayload', () => {
  it('sends an untouched date input as null rather than an empty string', () => {
    // date_applied and next_action_due are nullable date columns; SQLite will
    // happily store '' in one and every later read of it is junk.
    const payload = toApplicationPayload({ dateApplied: '', nextActionDue: '   ' });

    expect(payload).toEqual({ dateApplied: null, nextActionDue: null });
  });

  it('keeps a real date', () => {
    expect(toApplicationPayload({ dateApplied: '2026-01-31' })).toEqual({
      dateApplied: '2026-01-31',
    });
  });

  it('omits keys the caller did not supply, so PATCH stays partial', () => {
    const payload = toApplicationPayload({ status: JobStatus.OFFER });

    expect(payload).toEqual({ status: JobStatus.OFFER });
    expect('company' in payload).toBe(false);
    expect('notes' in payload).toBe(false);
  });

  it('drops server-owned fields', () => {
    const payload = toApplicationPayload({
      company: 'Acme',
      // @ts-expect-error — ApplicationInput excludes these; guard the runtime too.
      id: 7,
      interviewStages: [],
      statusHistory: [],
    });

    expect(payload).toEqual({ company: 'Acme' });
  });

  it('passes the nested recruiter object through for the API to flatten', () => {
    const recruiterContact = { name: 'Ada', email: 'ada@example.com', linkedin: '' };

    expect(toApplicationPayload({ recruiterContact })).toEqual({ recruiterContact });
  });
});

describe('toStagePayload', () => {
  it('sends an unscheduled stage as null', () => {
    expect(toStagePayload({ type: 'phone', scheduledAt: '' })).toEqual({
      type: 'phone',
      scheduledAt: null,
      notes: '',
    });
  });

  it('keeps a scheduled time and its notes', () => {
    expect(
      toStagePayload({ type: 'onsite', scheduledAt: '2026-02-01T09:00:00.000Z', notes: 'Loop' }),
    ).toEqual({ type: 'onsite', scheduledAt: '2026-02-01T09:00:00.000Z', notes: 'Loop' });
  });
});
