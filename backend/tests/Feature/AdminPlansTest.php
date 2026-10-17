<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The admin's plan editor: each plan's name, price label, description and
 * requests-per-minute cap, and per feature whether the plan includes it and
 * how many uses it allows per day, week or month.
 */
class AdminPlansTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_only_an_admin_can_read_or_edit_plans(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/admin/plans')->assertForbidden()->assertJsonPath('code', 'admin_required');
        $this->patchJson('/api/admin/plans/free', ['name' => 'Gratis'])->assertForbidden();

        $this->assertNull(Plan::find('free'));
    }

    public function test_it_lists_both_plans_with_defaults_filled_in(): void
    {
        $this->admin();

        $response = $this->getJson('/api/admin/plans')->assertOk();

        $this->assertSame(['free', 'premium'], array_column($response->json('plans'), 'key'));
        $this->assertSame('Free', $response->json('plans.0.name'));
        $this->assertCount(count(Feature::cases()), $response->json('plans.0.features'));
        $this->assertSame(
            array_map(fn (Feature $f) => ['key' => $f->value, 'name' => $f->label(), 'description' => $f->description(), 'group' => $f->group()], Feature::cases()),
            $response->json('features'),
        );
    }

    public function test_an_admin_edits_a_plans_text_and_rate(): void
    {
        $this->admin();

        $this->patchJson('/api/admin/plans/premium', [
            'name' => 'Pro',
            'priceLabel' => '$9 / month',
            'description' => 'Every AI tool.',
            'requestsPerMinute' => 12,
        ])
            ->assertOk()
            ->assertJsonPath('plan.key', 'premium')
            ->assertJsonPath('plan.name', 'Pro')
            ->assertJsonPath('plan.priceLabel', '$9 / month')
            ->assertJsonPath('plan.description', 'Every AI tool.')
            ->assertJsonPath('plan.requestsPerMinute', 12);

        $this->assertSame('Pro', Plan::find('premium')->name);
    }

    public function test_a_blank_rate_means_no_per_minute_cap(): void
    {
        $this->admin();

        $this->patchJson('/api/admin/plans/premium', ['requestsPerMinute' => null])
            ->assertOk()
            ->assertJsonPath('plan.requestsPerMinute', null);
    }

    public function test_an_admin_sets_a_features_access_and_limit_and_leaves_the_rest_alone(): void
    {
        $this->admin();

        $this->patchJson('/api/admin/plans/free', [
            'features' => [
                'ats_check' => ['enabled' => true, 'limit' => 3, 'period' => 'week'],
                'coding_tutor' => ['enabled' => true, 'limit' => null, 'period' => 'day'],
            ],
        ])->assertOk();

        $ats = PlanFeature::where('plan', 'free')->where('feature', 'ats_check')->sole();
        $this->assertTrue($ats->enabled);
        $this->assertSame(3, $ats->quota);
        $this->assertSame(QuotaPeriod::Week, $ats->period);

        // A second edit to one feature keeps the first edit to the other.
        $response = $this->patchJson('/api/admin/plans/free', [
            'features' => ['ats_check' => ['enabled' => false, 'limit' => 3, 'period' => 'week']],
        ])->assertOk();

        $features = collect($response->json('plan.features'))->keyBy('key');
        $this->assertFalse($features['ats_check']['enabled']);
        $this->assertTrue($features['coding_tutor']['enabled']);
        $this->assertNull($features['coding_tutor']['limit']);
        // Untouched features still read as their defaults.
        $this->assertEquals(Feature::TailoredCv->defaultSetting(AccountPlan::Free)->toArray(), $features['tailored_cv']);
    }

    public function test_it_rejects_settings_it_cannot_enforce(): void
    {
        $this->admin();

        $this->patchJson('/api/admin/plans/free', ['features' => ['teleport' => ['enabled' => true, 'limit' => 1, 'period' => 'day']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('features');

        $this->patchJson('/api/admin/plans/free', ['features' => ['ats_check' => ['enabled' => true, 'limit' => 0, 'period' => 'day']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('features.ats_check.limit');

        $this->patchJson('/api/admin/plans/free', ['features' => ['ats_check' => ['enabled' => true, 'limit' => 5, 'period' => 'fortnight']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('features.ats_check.period');

        $this->patchJson('/api/admin/plans/free', ['requestsPerMinute' => 0])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('requestsPerMinute');

        $this->patchJson('/api/admin/plans/free', ['name' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('name');

        $this->assertSame(0, PlanFeature::count());
    }

    public function test_an_unknown_plan_is_not_found(): void
    {
        $this->admin();

        $this->patchJson('/api/admin/plans/enterprise', ['name' => 'Enterprise'])->assertNotFound();
    }
}
