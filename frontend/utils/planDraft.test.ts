import { describe, expect, it } from 'vitest';
import { PlanInfo } from '../types/auth';
import { isDirty, toDraft, toPatch } from './planDraft';

const plan: PlanInfo = {
  key: 'premium',
  name: 'Premium',
  priceLabel: null,
  description: 'Every AI tool.',
  requestsPerMinute: 30,
  features: [
    { key: 'tailored_cv', enabled: true, limit: 60, period: 'day' },
    { key: 'coding_tutor', enabled: true, limit: null, period: 'day' },
  ],
};

describe('toDraft and toPatch', () => {
  it('round-trips a plan unchanged', () => {
    const result = toPatch(toDraft(plan));

    expect(result).toEqual({
      ok: true,
      patch: {
        name: 'Premium',
        priceLabel: null,
        description: 'Every AI tool.',
        requestsPerMinute: 30,
        features: {
          tailored_cv: { enabled: true, limit: 60, period: 'day' },
          coding_tutor: { enabled: true, limit: null, period: 'day' },
        },
      },
    });
  });

  it('reads a blank limit as unlimited and a blank rate as no cap', () => {
    const draft = toDraft(plan);
    draft.features.tailored_cv.limit = '  ';
    draft.requestsPerMinute = '';

    const result = toPatch(draft);

    expect(result.ok && result.patch.features?.tailored_cv?.limit).toBeNull();
    expect(result.ok && result.patch.requestsPerMinute).toBeNull();
  });

  it('refuses a limit that is not a whole number of at least 1, naming the feature', () => {
    for (const bad of ['0', '-3', '2.5', 'ten']) {
      const draft = toDraft(plan);
      draft.features.tailored_cv.limit = bad;

      const result = toPatch(draft, new Map([['tailored_cv', 'Tailored CV writer']]));

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/^Tailored CV writer: /);
    }
  });

  it('refuses a blank name and a bad rate', () => {
    expect(toPatch({ ...toDraft(plan), name: ' ' }).ok).toBe(false);
    expect(toPatch({ ...toDraft(plan), requestsPerMinute: '0' }).ok).toBe(false);
  });

  it('trims text and saves blank text as null', () => {
    const result = toPatch({ ...toDraft(plan), name: ' Pro ', priceLabel: ' $9 / month ', description: '  ' });

    expect(result.ok && result.patch).toMatchObject({ name: 'Pro', priceLabel: '$9 / month', description: null });
  });
});

describe('isDirty', () => {
  it('notices an edit and its undoing', () => {
    const draft = toDraft(plan);
    expect(isDirty(draft, plan)).toBe(false);

    draft.features.coding_tutor.enabled = false;
    expect(isDirty(draft, plan)).toBe(true);

    draft.features.coding_tutor.enabled = true;
    expect(isDirty(draft, plan)).toBe(false);
  });
});
