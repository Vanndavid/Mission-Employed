/**
 * Plans: the signed-in account's allowances and usage, asking for Premium, and
 * the admin's plan editor.
 *
 * Flat responses like the auth endpoints, no `data` envelope. There is no
 * payment integration: a Premium request is answered by an admin by hand.
 */

import { AccountPlan, FeatureInfo, FeatureSetting, FeatureKey, PlanInfo, Subscription } from '../types/auth';
import { apiRequest } from './http';

export async function fetchSubscription(signal?: AbortSignal): Promise<Subscription> {
  return apiRequest<Subscription>('/subscription', { signal });
}

/** Idempotent: asking again keeps the original request date. 409 `already_premium` on Premium. */
export async function requestPremium(): Promise<Subscription> {
  return apiRequest<Subscription>('/subscription/request', { method: 'POST' });
}

export async function withdrawPremiumRequest(): Promise<Subscription> {
  return apiRequest<Subscription>('/subscription/request', { method: 'DELETE' });
}

export interface AdminPlans {
  features: FeatureInfo[];
  plans: PlanInfo[];
}

export async function fetchAdminPlans(): Promise<AdminPlans> {
  return apiRequest<AdminPlans>('/admin/plans');
}

/** Partial: a field or feature left out keeps its current setting. */
export interface PlanPatch {
  name?: string;
  priceLabel?: string | null;
  description?: string | null;
  requestsPerMinute?: number | null;
  features?: Partial<Record<FeatureKey, Omit<FeatureSetting, 'key'>>>;
}

export async function updateAdminPlan(plan: AccountPlan, patch: PlanPatch): Promise<{ plan: PlanInfo }> {
  return apiRequest<{ plan: PlanInfo }>(`/admin/plans/${plan}`, { method: 'PATCH', body: patch });
}
