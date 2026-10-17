/**
 * The admin plan editor's form state, and the PATCH it turns into. Inputs
 * hold strings, so a half-typed number is not lost; toPatch() is where they
 * become numbers or a reason to refuse.
 */

import { FeatureKey, PlanInfo, QuotaPeriod } from '../types/auth';
import { PlanPatch } from '../services/subscriptionClient';

export interface FeatureDraft {
  enabled: boolean;
  /** Blank is unlimited. */
  limit: string;
  period: QuotaPeriod;
}

export interface PlanDraft {
  name: string;
  priceLabel: string;
  description: string;
  /** Blank is no cap. */
  requestsPerMinute: string;
  features: Record<string, FeatureDraft>;
}

export function toDraft(plan: PlanInfo): PlanDraft {
  return {
    name: plan.name,
    priceLabel: plan.priceLabel ?? '',
    description: plan.description ?? '',
    requestsPerMinute: plan.requestsPerMinute === null ? '' : String(plan.requestsPerMinute),
    features: Object.fromEntries(
      plan.features.map(feature => [
        feature.key,
        { enabled: feature.enabled, limit: feature.limit === null ? '' : String(feature.limit), period: feature.period },
      ]),
    ),
  };
}

/** Blank → null; a whole number ≥ 1 → that number; anything else → undefined (invalid). */
function positiveOrBlank(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return parsed >= 1 ? parsed : undefined;
}

export type PatchResult = { ok: true; patch: PlanPatch } | { ok: false; error: string };

/**
 * The whole plan as a PATCH: every field and every feature, so what is saved
 * is exactly what is on screen. `names` labels the features in an error.
 */
export function toPatch(draft: PlanDraft, names: Map<string, string> = new Map()): PatchResult {
  if (draft.name.trim() === '') return { ok: false, error: 'A plan needs a name.' };

  const requestsPerMinute = positiveOrBlank(draft.requestsPerMinute);
  if (requestsPerMinute === undefined) {
    return { ok: false, error: 'Requests per minute must be a whole number of at least 1, or blank for no cap.' };
  }

  const features: NonNullable<PlanPatch['features']> = {};
  for (const [key, feature] of Object.entries(draft.features)) {
    const limit = positiveOrBlank(feature.limit);
    if (limit === undefined) {
      return {
        ok: false,
        error: `${names.get(key) ?? key}: the limit must be a whole number of at least 1, or blank for unlimited. To switch it off, untick it.`,
      };
    }
    features[key as FeatureKey] = { enabled: feature.enabled, limit, period: feature.period };
  }

  return {
    ok: true,
    patch: {
      name: draft.name.trim(),
      priceLabel: draft.priceLabel.trim() || null,
      description: draft.description.trim() || null,
      requestsPerMinute,
      features,
    },
  };
}

/** Whether a draft differs from what is saved. */
export function isDirty(draft: PlanDraft, plan: PlanInfo): boolean {
  return JSON.stringify(draft) !== JSON.stringify(toDraft(plan));
}

