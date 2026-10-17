<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Models\AiSession;
use App\Models\Application;
use App\Models\FeatureUsage;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The `feature` middleware: which plan reaches which feature, and how often.
 *
 * An admin sets both per plan (PlanFeature); with nothing stored a feature
 * falls back to Feature::defaultSetting(). A use is one request that reached
 * the model, so a refused, invalid or failed request costs nothing, and
 * opening or reading a session needs access but is free.
 */
class FeatureGateTest extends TestCase
{
    use RefreshDatabase;

    private function configure(
        AccountPlan $plan,
        Feature $feature,
        bool $enabled = true,
        ?int $limit = null,
        QuotaPeriod $period = QuotaPeriod::Day,
    ): void {
        PlanFeature::factory()->create([
            'plan' => $plan->value,
            'feature' => $feature,
            'enabled' => $enabled,
            'quota' => $limit,
            'period' => $period,
        ]);
    }

    private function signIn(User $user): User
    {
        Sanctum::actingAs($user);

        return $user;
    }

    private function problem(): TestResponse
    {
        return $this->postJson('/api/ai/coding/problem', ['difficulty' => 'easy']);
    }

    public function test_premium_reaches_every_ai_feature_with_nothing_configured(): void
    {
        $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        $this->problem()->assertOk();
        $this->assertSame(1, FeatureUsage::count());
    }

    public function test_an_admin_can_open_a_premium_feature_to_the_free_plan(): void
    {
        $this->configure(AccountPlan::Free, Feature::CodingProblem, limit: 3, period: QuotaPeriod::Month);
        $user = $this->signIn(User::factory()->create());
        FakeGeminiService::swap();

        $this->problem()->assertOk();

        $this->assertSame(1, $user->featureUsages()->where('feature', Feature::CodingProblem)->count());
    }

    public function test_a_free_user_is_told_the_feature_is_premium(): void
    {
        $this->signIn(User::factory()->create());
        $gemini = FakeGeminiService::swap();

        $this->problem()
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required')
            ->assertJsonPath('feature', 'coding_problem')
            ->assertJsonPath('message', 'Coding problem generator is a Premium feature.');

        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_a_feature_turned_off_for_every_plan_is_unavailable_rather_than_premium(): void
    {
        $this->configure(AccountPlan::Premium, Feature::JobParse, enabled: false);
        $this->signIn(User::factory()->premium()->create());
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/job/parse', ['text' => 'Acme is hiring.'])
            ->assertForbidden()
            ->assertJsonPath('code', 'feature_unavailable')
            ->assertJsonPath('message', 'Job description parsing is not available on your plan.');

        $gemini->assertNothingSent();
    }

    public function test_a_quota_refuses_the_request_past_the_limit_without_calling_the_model(): void
    {
        $this->travelTo('2026-10-17 15:00:00');
        $this->configure(AccountPlan::Premium, Feature::CodingProblem, limit: 2);
        $this->signIn(User::factory()->premium()->create());
        $gemini = FakeGeminiService::swap();

        $this->problem()->assertOk();
        $this->problem()->assertOk();

        $this->problem()
            ->assertStatus(429)
            ->assertJsonPath('code', 'quota_exceeded')
            ->assertJsonPath('feature', 'coding_problem')
            ->assertJsonPath('limit', 2)
            ->assertJsonPath('period', 'day')
            ->assertJsonPath('resetsAt', '2026-10-18T00:00:00+00:00')
            ->assertJsonPath(
                'message',
                'You have reached your Coding problem generator limit (2 per day). It resets Sun 18 Oct at 00:00 UTC.',
            );

        $gemini->assertCallCount('generateJson', 2);
        $this->assertSame(2, FeatureUsage::count());
    }

    public function test_a_free_user_at_their_limit_hears_that_premium_allows_more(): void
    {
        $this->configure(AccountPlan::Free, Feature::CodingProblem, limit: 1, period: QuotaPeriod::Month);
        $this->signIn(User::factory()->create());
        FakeGeminiService::swap();

        $this->problem()->assertOk();

        $this->assertStringEndsWith(' Premium has a higher limit.', $this->problem()->assertStatus(429)->json('message'));
    }

    public function test_the_quota_comes_back_when_the_period_turns_over(): void
    {
        $this->travelTo('2026-10-17 23:30:00');
        $this->configure(AccountPlan::Premium, Feature::CodingProblem, limit: 1);
        $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        $this->problem()->assertOk();
        $this->problem()->assertStatus(429);

        $this->travelTo('2026-10-18 00:00:01');

        $this->problem()->assertOk();
    }

    public function test_a_failed_model_call_does_not_use_up_the_quota(): void
    {
        $this->configure(AccountPlan::Premium, Feature::CodingProblem, limit: 1);
        $this->signIn(User::factory()->premium()->create());
        $gemini = FakeGeminiService::swap()->throwOn('generateJson', new GeminiException('upstream down'));

        $this->problem()->assertStatus(502);
        $this->assertSame(0, FeatureUsage::count());

        $gemini->reset();

        $this->problem()->assertOk();
    }

    public function test_an_invalid_request_does_not_use_up_the_quota(): void
    {
        $this->configure(AccountPlan::Premium, Feature::JobParse, limit: 1);
        $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        $this->postJson('/api/ai/job/parse', ['text' => ''])->assertUnprocessable();

        $this->postJson('/api/ai/job/parse', ['text' => 'Acme is hiring a Senior SWE.'])->assertOk();
    }

    public function test_opening_a_session_needs_access_but_only_its_messages_count(): void
    {
        $this->configure(AccountPlan::Premium, Feature::CodingTutor, limit: 1);
        $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        $open = fn () => $this->postJson('/api/ai/coding/sessions', [
            'problemTitle' => 'Two Sum',
            'problemDescription' => 'Find two numbers that add to a target.',
        ])->assertCreated()->json('session.id');

        $open();
        $session = $open();
        $this->assertSame(0, FeatureUsage::count());

        $this->getJson("/api/ai/sessions/{$session}")->assertOk();
        $this->postJson("/api/ai/sessions/{$session}/messages", ['message' => 'Hint?'])->assertOk();

        $this->postJson("/api/ai/sessions/{$session}/messages", ['message' => 'Another?'])
            ->assertStatus(429)
            ->assertJsonPath('feature', 'coding_tutor');
    }

    public function test_a_refine_chat_counts_against_the_document_it_refines(): void
    {
        $this->configure(AccountPlan::Premium, Feature::TailoredCv, limit: 1);
        $user = $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        $cv = AiSession::factory()->for($user)->kind('cv')->create();
        $tutor = AiSession::factory()->for($user)->kind('coding')->create();

        $this->postJson("/api/ai/sessions/{$cv->id}/messages", ['message' => 'Shorter.'])->assertOk();
        $this->postJson("/api/ai/sessions/{$cv->id}/messages", ['message' => 'Shorter still.'])
            ->assertStatus(429)
            ->assertJsonPath('feature', 'tailored_cv');

        // The tutor is a different feature with its own allowance.
        $this->postJson("/api/ai/sessions/{$tutor->id}/messages", ['message' => 'Hint?'])->assertOk();
    }

    public function test_a_session_whose_feature_is_closed_is_refused_by_its_kind(): void
    {
        $this->configure(AccountPlan::Free, Feature::CodingTutor);
        $user = $this->signIn(User::factory()->create());
        FakeGeminiService::swap();

        $tutor = AiSession::factory()->for($user)->kind('coding')->create();
        $cv = AiSession::factory()->for($user)->kind('cv')->create();

        $this->getJson("/api/ai/sessions/{$tutor->id}")->assertOk();
        $this->getJson("/api/ai/sessions/{$cv->id}")
            ->assertForbidden()
            ->assertJsonPath('feature', 'tailored_cv');
    }

    /**
     * The gate runs before the controller's own ownership check, so it has to
     * answer 404 itself: a 403 would confirm the session exists, and its
     * feature would say what kind it is.
     */
    public function test_someone_elses_session_is_not_found_rather_than_refused(): void
    {
        $this->signIn(User::factory()->create());
        $theirs = AiSession::factory()->for(User::factory()->premium())->kind('cv')->create();
        FakeGeminiService::swap();

        $this->getJson("/api/ai/sessions/{$theirs->id}")->assertNotFound();
        $this->postJson("/api/ai/mock/sessions/{$theirs->id}/turns", ['answer' => 'Hi'])->assertNotFound();
    }

    public function test_an_admin_is_never_refused_but_their_use_is_counted(): void
    {
        $this->configure(AccountPlan::Premium, Feature::CodingProblem, limit: 1);
        $this->configure(AccountPlan::Free, Feature::CodingProblem, enabled: false);
        $this->signIn(User::factory()->admin()->create(['plan' => 'free']));
        FakeGeminiService::swap();

        $this->problem()->assertOk();
        $this->problem()->assertOk();
        $this->problem()->assertOk();

        $this->assertSame(3, FeatureUsage::count());
    }

    public function test_a_lapsed_premium_subscription_falls_back_to_free(): void
    {
        $this->travelTo('2026-10-17 12:00:00');
        FakeGeminiService::swap();

        $this->signIn(User::factory()->premium()->create(['plan_expires_at' => '2026-10-18 00:00:00']));
        $this->problem()->assertOk();

        $this->signIn(User::factory()->premium()->create(['plan_expires_at' => '2026-10-17 11:59:59']));
        $this->problem()->assertForbidden()->assertJsonPath('code', 'premium_required');
    }

    public function test_an_ats_recheck_that_reuses_the_cached_keywords_is_free(): void
    {
        $this->configure(AccountPlan::Premium, Feature::AtsCheck, limit: 1);
        $user = $this->signIn(User::factory()->premium()->create());
        $application = Application::factory()->for($user)->create([
            'role' => 'Senior Software Engineer',
            'job_description' => 'Run our PHP services on Kubernetes.',
            'tailored_cv' => 'Ran PHP on K8s for five years.',
        ]);
        $gemini = FakeGeminiService::swap()->queueJson(['keywords' => [
            ['term' => 'PHP', 'aliases' => [], 'kind' => 'skill', 'required' => true],
        ]]);

        $this->postJson("/api/ai/applications/{$application->id}/ats")->assertOk();
        $this->postJson("/api/ai/applications/{$application->id}/ats")->assertOk();
        $this->postJson("/api/ai/applications/{$application->id}/ats")->assertOk();

        $gemini->assertCallCount('generateJson', 1);
        $this->assertSame(1, FeatureUsage::count());
    }

    public function test_seek_job_search_is_a_feature_an_admin_can_make_premium(): void
    {
        $this->configure(AccountPlan::Free, Feature::SeekJobs, enabled: false);
        $this->signIn(User::factory()->create());
        Http::fake();

        $this->getJson('/api/seek/jobs')
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        Http::assertNothingSent();
    }

    public function test_requests_per_minute_are_capped_by_the_plan(): void
    {
        Plan::factory()->create(['key' => 'premium', 'requests_per_minute' => 2]);
        $this->signIn(User::factory()->premium()->create());
        $gemini = FakeGeminiService::swap();

        $this->problem()->assertOk();
        $this->problem()->assertOk();

        $this->problem()
            ->assertStatus(429)
            ->assertJsonPath('code', 'rate_limited');

        $gemini->assertCallCount('generateJson', 2);

        $this->travel(61)->seconds();

        $this->problem()->assertOk();
    }

    public function test_a_plan_with_no_requests_per_minute_is_not_throttled(): void
    {
        Plan::factory()->create(['key' => 'premium', 'requests_per_minute' => null]);
        $this->signIn(User::factory()->premium()->create());
        FakeGeminiService::swap();

        for ($i = 0; $i < 5; $i++) {
            $this->problem()->assertOk();
        }
    }
}
