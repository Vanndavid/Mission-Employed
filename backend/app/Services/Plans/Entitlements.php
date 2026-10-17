<?php

namespace App\Services\Plans;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Http\Middleware\EnsureFeature;
use App\Models\FeatureUsage;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Which features an account's plan includes, how much of each it has used,
 * and the claim on one more use that {@see EnsureFeature} makes before a
 * request is allowed through.
 *
 * Everything is read from plan_features with Feature::defaultSetting() filling
 * any gap, and nothing is cached: an admin's edit applies to the very next
 * request.
 */
class Entitlements
{
    /**
     * Every feature's setting on a plan, in catalog order.
     *
     * @return array<string, FeatureSetting> keyed by feature value
     */
    public function settings(AccountPlan $plan): array
    {
        $stored = PlanFeature::query()
            ->where('plan', $plan->value)
            ->get()
            ->keyBy(fn (PlanFeature $row) => $row->feature->value);

        $settings = [];

        foreach (Feature::cases() as $feature) {
            $settings[$feature->value] = $stored->get($feature->value)?->toSetting()
                ?? $feature->defaultSetting($plan);
        }

        return $settings;
    }

    public function setting(AccountPlan $plan, Feature $feature): FeatureSetting
    {
        return PlanFeature::query()
            ->where('plan', $plan->value)
            ->where('feature', $feature->value)
            ->first()?->toSetting()
            ?? $feature->defaultSetting($plan);
    }

    /** What this account may do with a feature. Admins may do anything. */
    public function settingFor(User $user, Feature $feature): FeatureSetting
    {
        return $user->isAdmin()
            ? FeatureSetting::unlimited($feature)
            : $this->setting($user->effectivePlan(), $feature);
    }

    /**
     * Claim one use of a feature before doing the work; null when the
     * allowance is spent.
     *
     * Claim first, then count everything up to and including the claim, so
     * two requests racing for the last use cannot both win: the later row
     * sees the earlier one. The caller deletes the claim if the work fails.
     */
    public function claim(User $user, FeatureSetting $setting): ?FeatureUsage
    {
        $usage = $user->featureUsages()->create(['feature' => $setting->feature]);

        if ($setting->limit === null) {
            return $usage;
        }

        $used = $user->featureUsages()
            ->where('feature', $setting->feature->value)
            ->where('created_at', '>=', $setting->period->start())
            ->where('id', '<=', $usage->id)
            ->count();

        if ($used > $setting->limit) {
            $usage->delete();

            return null;
        }

        return $usage;
    }

    /**
     * The account's plan, allowances and usage, and every plan beside it: the
     * whole of GET /api/subscription.
     *
     * @return array<string, mixed>
     */
    public function summary(User $user): array
    {
        $plan = $user->effectivePlan();

        $settings = $user->isAdmin()
            ? array_map(fn (Feature $feature) => FeatureSetting::unlimited($feature), array_combine(Feature::values(), Feature::cases()))
            : $this->settings($plan);

        $used = $this->used($user);
        $now = Carbon::now();

        return [
            'plan' => $plan->value,
            // Kept after it passes, so the client can say when Premium ended.
            'planExpiresAt' => $user->plan === AccountPlan::Premium ? $user->plan_expires_at?->toIso8601String() : null,
            'premiumRequestedAt' => $user->premium_requested_at?->toIso8601String(),
            'requestsPerMinute' => $user->isAdmin() ? null : Plan::resolve($plan)->requests_per_minute,
            'features' => array_values(array_map(fn (FeatureSetting $setting) => $this->catalogEntry($setting->feature) + [
                'enabled' => $setting->enabled,
                'limit' => $setting->limit,
                'period' => $setting->period->value,
                'used' => $used[$setting->feature->value][$setting->period->value] ?? 0,
                'resetsAt' => $setting->limit === null ? null : $setting->period->resetsAt($now)->toIso8601String(),
            ], $settings)),
            'plans' => $this->plans(),
        ];
    }

    /**
     * Every plan with its terms, for the plans page and the admin editor.
     *
     * @return list<array<string, mixed>>
     */
    public function plans(): array
    {
        return array_map(fn (AccountPlan $plan) => $this->plan($plan), AccountPlan::cases());
    }

    /** @return array<string, mixed> */
    public function plan(AccountPlan $plan): array
    {
        $stored = Plan::resolve($plan);

        return [
            'key' => $plan->value,
            'name' => $stored->name,
            'priceLabel' => $stored->price_label,
            'description' => $stored->description,
            'requestsPerMinute' => $stored->requests_per_minute,
            'features' => array_values(array_map(
                fn (FeatureSetting $setting) => $setting->toArray(),
                $this->settings($plan),
            )),
        ];
    }

    /**
     * The catalog without any plan's terms.
     *
     * @return list<array{key: string, name: string, description: string, group: string}>
     */
    public function catalog(): array
    {
        return array_map(fn (Feature $feature) => $this->catalogEntry($feature), Feature::cases());
    }

    /** @return array{key: string, name: string, description: string, group: string} */
    private function catalogEntry(Feature $feature): array
    {
        return [
            'key' => $feature->value,
            'name' => $feature->label(),
            'description' => $feature->description(),
            'group' => $feature->group(),
        ];
    }

    /**
     * Uses so far in the current day, week and month, per feature, in one
     * grouped query. Plain CASE and SUM so it stays portable off SQLite.
     *
     * @return array<string, array<string, int>> feature value => period value => count
     */
    private function used(User $user): array
    {
        $starts = [];
        foreach (QuotaPeriod::cases() as $period) {
            $starts[$period->value] = $period->start();
        }

        $query = FeatureUsage::query()
            ->toBase()
            ->where('user_id', $user->id)
            ->where('created_at', '>=', min($starts))
            ->select('feature')
            ->groupBy('feature');

        foreach ($starts as $period => $start) {
            $query->selectRaw("SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS {$period}_count", [$start]);
        }

        $used = [];

        foreach ($query->get() as $row) {
            foreach (array_keys($starts) as $period) {
                $used[$row->feature][$period] = (int) $row->{"{$period}_count"};
            }
        }

        return $used;
    }
}
