import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FeatureAllowance, FeatureKey, Subscription } from '../types/auth';
import {
  fetchSubscription,
  requestPremium as sendPremiumRequest,
  withdrawPremiumRequest,
} from '../services/subscriptionClient';
import { ApiError, errorMessage, isAbortError } from '../services/http';
import { useAuth } from './AuthContext';

interface SubscriptionContextValue {
  /** Null until the first load lands (and without a provider). */
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  /**
   * Whether the account's plan includes a feature. Until the plan has loaded
   * this is the old rule, premium or admin, which is also the default
   * configuration, so a premium user never sees a gate flash past.
   */
  canUse: (feature: FeatureKey) => boolean;
  allowance: (feature: FeatureKey) => FeatureAllowance | null;
  /** Whether the Premium plan includes a feature, i.e. upgrading would unlock it. */
  premiumIncludes: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
  /**
   * Call with anything a feature request threw. A plan refusal means our copy
   * of the plan or usage is stale, so it is re-read; the return value says
   * whether it was one.
   */
  noteRefusal: (cause: unknown) => boolean;
  requestPremium: () => Promise<void>;
  withdrawPremiumRequest: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

/**
 * The signed-in account's plan, allowances and usage, from GET /api/subscription.
 *
 * The server enforces all of it (the `feature` middleware); this only lets a
 * screen show a gate up front rather than after a refused request.
 */
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, isPremium, refreshUser } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSubscription(await fetchSubscription());
      setError(null);
    } catch (cause) {
      if (!isAbortError(cause)) setError(errorMessage(cause, 'Could not load your plan.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-read whenever the plan the server reports for the account changes, so
  // an admin's upgrade or a lapse is picked up with the next /auth/me.
  useEffect(() => {
    if (user) void refresh();
  }, [refresh, user?.id, user?.plan, user?.role]);

  const value = useMemo<SubscriptionContextValue>(() => {
    const byKey = new Map(subscription?.features.map(feature => [feature.key, feature]) ?? []);
    const premium = subscription?.plans.find(plan => plan.key === 'premium');

    return {
      subscription,
      loading,
      error,
      canUse: feature => byKey.get(feature)?.enabled ?? isPremium,
      allowance: feature => byKey.get(feature) ?? null,
      premiumIncludes: feature => premium?.features.find(f => f.key === feature)?.enabled ?? true,
      refresh,
      noteRefusal: cause => {
        if (!(cause instanceof ApiError) || !cause.isPlanRefusal) return false;
        // A Premium refusal can mean the plan lapsed, which /auth/me reports.
        if (cause.isPremiumRequired) void refreshUser();
        void refresh();
        return true;
      },
      requestPremium: async () => setSubscription(await sendPremiumRequest()),
      withdrawPremiumRequest: async () => setSubscription(await withdrawPremiumRequest()),
    };
  }, [subscription, loading, error, isPremium, refresh, refreshUser]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

/**
 * Outside a provider (a screen rendered on its own in a test) this answers
 * from the auth context alone: premium or admin can use everything.
 */
export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  const { isPremium, refreshUser } = useAuth();

  if (ctx) return ctx;

  const unavailable = async () => {
    throw new Error('No SubscriptionProvider');
  };

  return {
    subscription: null,
    loading: false,
    error: null,
    canUse: () => isPremium,
    allowance: () => null,
    premiumIncludes: () => true,
    refresh: async () => {},
    noteRefusal: cause => {
      if (!(cause instanceof ApiError) || !cause.isPlanRefusal) return false;
      if (cause.isPremiumRequired) void refreshUser?.();
      return true;
    },
    requestPremium: unavailable,
    withdrawPremiumRequest: unavailable,
  };
}
