<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Models\FeatureUsage;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/subscription — what the signed-in account's plan includes, how much
 * of each allowance is used, and every plan to compare it with — and the
 * "Request Premium" button, which an admin answers by hand.
 */
class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_requires_a_token(): void
    {
        $this->getJson('/api/subscription')->assertUnauthorized();
        $this->postJson('/api/subscription/request')->assertUnauthorized();
    }

    public function test_it_describes_a_free_account_with_its_usage_and_both_plans(): void
    {
        $this->travelTo('2026-10-17 15:00:00');
        PlanFeature::factory()->create([
            'plan' => 'free',
            'feature' => Feature::JobParse,
            'enabled' => true,
            'quota' => 5,
            'period' => QuotaPeriod::Month,
        ]);
        $user = User::factory()->create();
        FeatureUsage::factory()->for($user)->count(2)->create(['feature' => Feature::JobParse]);
        // Last month's use has reset and does not count.
        FeatureUsage::factory()->for($user)->create(['feature' => Feature::JobParse, 'created_at' => '2026-09-30 23:00:00']);
        // Someone else's use is not this account's.
        FeatureUsage::factory()->create(['feature' => Feature::JobParse]);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('plan', 'free')
            ->assertJsonPath('planExpiresAt', null)
            ->assertJsonPath('premiumRequestedAt', null)
            ->assertJsonPath('requestsPerMinute', AccountPlan::Free->defaultRequestsPerMinute());

        $features = collect($response->json('features'))->keyBy('key');

        $this->assertSame(array_map(fn (Feature $f) => $f->value, Feature::cases()), $features->keys()->all());
        $this->assertSame([
            'key' => 'job_parse',
            'name' => 'Job description parsing',
            'description' => Feature::JobParse->description(),
            'group' => 'Job applications',
            'enabled' => true,
            'limit' => 5,
            'period' => 'month',
            'used' => 2,
            'resetsAt' => '2026-11-01T00:00:00+00:00',
        ], $features['job_parse']);
        $this->assertFalse($features['tailored_cv']['enabled']);

        $this->assertSame(['free', 'premium'], array_column($response->json('plans'), 'key'));
        $premium = $response->json('plans.1');
        $this->assertSame('Premium', $premium['name']);
        $this->assertSame(
            ['key' => 'tailored_cv', 'enabled' => true, 'limit' => Feature::TailoredCv->defaultSetting(AccountPlan::Premium)->limit, 'period' => 'day'],
            collect($premium['features'])->firstWhere('key', 'tailored_cv'),
        );
    }

    public function test_an_unlimited_feature_has_no_reset(): void
    {
        PlanFeature::factory()->create(['plan' => 'premium', 'feature' => Feature::CodingTutor, 'enabled' => true, 'quota' => null]);
        Sanctum::actingAs(User::factory()->premium()->create());

        $tutor = collect($this->getJson('/api/subscription')->json('features'))->firstWhere('key', 'coding_tutor');

        $this->assertNull($tutor['limit']);
        $this->assertNull($tutor['resetsAt']);
    }

    public function test_an_admin_has_every_feature_without_limits(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create(['plan' => 'free']));

        $response = $this->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('plan', 'premium')
            ->assertJsonPath('requestsPerMinute', null);

        foreach ($response->json('features') as $feature) {
            $this->assertTrue($feature['enabled'], $feature['key']);
            $this->assertNull($feature['limit'], $feature['key']);
        }
    }

    public function test_an_admins_plan_text_reaches_every_account(): void
    {
        Plan::factory()->create(['key' => 'premium', 'name' => 'Pro', 'price_label' => '$9 / month', 'description' => 'Everything.']);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/subscription')
            ->assertJsonPath('plans.1.name', 'Pro')
            ->assertJsonPath('plans.1.priceLabel', '$9 / month')
            ->assertJsonPath('plans.1.description', 'Everything.');
    }

    public function test_a_lapsed_subscription_reads_as_free_and_says_when_it_ended(): void
    {
        $this->travelTo('2026-10-17 12:00:00');
        Sanctum::actingAs(User::factory()->premium()->create(['plan_expires_at' => '2026-10-01 00:00:00']));

        $this->getJson('/api/subscription')
            ->assertJsonPath('plan', 'free')
            ->assertJsonPath('planExpiresAt', '2026-10-01T00:00:00+00:00');
    }

    public function test_a_free_user_can_request_premium_once(): void
    {
        $this->travelTo('2026-10-17 12:00:00');
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/subscription/request')
            ->assertOk()
            ->assertJsonPath('premiumRequestedAt', '2026-10-17T12:00:00+00:00');

        // Asking again keeps the place in the queue rather than resetting it.
        $this->travelTo('2026-10-18 12:00:00');
        $this->postJson('/api/subscription/request')
            ->assertOk()
            ->assertJsonPath('premiumRequestedAt', '2026-10-17T12:00:00+00:00');
    }

    public function test_a_request_can_be_withdrawn(): void
    {
        $user = User::factory()->create(['premium_requested_at' => now()]);
        Sanctum::actingAs($user);

        $this->deleteJson('/api/subscription/request')
            ->assertOk()
            ->assertJsonPath('premiumRequestedAt', null);

        $this->assertNull($user->fresh()->premium_requested_at);
    }

    public function test_an_account_already_on_premium_cannot_request_it(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->postJson('/api/subscription/request')
            ->assertStatus(409)
            ->assertJsonPath('code', 'already_premium');
    }

    public function test_a_lapsed_subscription_can_request_premium_again(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create(['plan_expires_at' => now()->subDay()]));

        $this->postJson('/api/subscription/request')->assertOk();
    }
}
