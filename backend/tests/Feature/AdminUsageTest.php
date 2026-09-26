<?php

namespace Tests\Feature;

use App\Models\AiUsage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUsageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-09-26 12:00:00');
    }

    private function used(User $user, string $feature, int $tokens, ?int $costMicros, string $when, string $source = 'server'): void
    {
        AiUsage::factory()->for($user)->create([
            'feature' => $feature,
            'source' => $source,
            'prompt_tokens' => $tokens - 10,
            'output_tokens' => 10,
            'thought_tokens' => 0,
            'total_tokens' => $tokens,
            'cost_micros' => $costMicros,
            'created_at' => Carbon::parse($when),
        ]);
    }

    public function test_an_admin_sees_each_users_usage_in_the_window_and_all_time(): void
    {
        $admin = User::factory()->admin()->create();
        $alice = User::factory()->premium()->create();
        $bob = User::factory()->premium()->create();

        $this->used($alice, 'ai/coding/problem', 1000, 2_000, '2026-09-25 10:00');
        $this->used($alice, 'ai/coding/problem', 500, 1_000, '2026-09-20 10:00');
        $this->used($alice, 'ai/mock/live', 3000, 9_000, '2026-09-24 10:00', 'live');
        // Outside a 30-day window, inside all time.
        $this->used($alice, 'ai/cv/generate', 400, 800, '2026-07-01 10:00');
        $this->used($bob, 'ai/job/parse', 100, null, '2026-09-26 09:00');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/usage?days=30')->assertOk();

        $response->assertJsonPath('days', 30);
        $users = collect($response->json('users'))->keyBy('userId');

        $this->assertEqualsCanonicalizing([$alice->id, $bob->id], $users->keys()->all());

        $a = $users[$alice->id];
        $this->assertSame(3, $a['window']['calls']);
        $this->assertSame(4500, $a['window']['totalTokens']);
        $this->assertEqualsWithDelta(0.012, $a['window']['costUsd'], 1e-9);
        $this->assertSame('2026-09-25T10:00:00.000000Z', $a['window']['lastUsedAt']);
        $this->assertSame(4, $a['allTime']['calls']);
        $this->assertSame(4900, $a['allTime']['totalTokens']);
        $this->assertEqualsWithDelta(0.0128, $a['allTime']['costUsd'], 1e-9);

        // The breakdown covers the window, biggest first.
        $this->assertSame(
            [['ai/mock/live', 'live', 1, 3000], ['ai/coding/problem', 'server', 2, 1500]],
            collect($a['byFeature'])->map(fn ($f) => [$f['feature'], $f['source'], $f['calls'], $f['totalTokens']])->all(),
        );

        // A call whose price is unknown counts, but is not priced as zero.
        $b = $users[$bob->id];
        $this->assertSame(100, $b['window']['totalTokens']);
        $this->assertSame(0.0, (float) $b['window']['costUsd']);
        $this->assertSame(1, $b['window']['unpricedCalls']);
    }

    public function test_the_window_defaults_to_thirty_days_and_is_bounded(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/admin/usage')->assertOk()->assertJsonPath('days', 30);
        $this->getJson('/api/admin/usage?days=0')->assertUnprocessable()->assertJsonValidationErrors('days');
        $this->getJson('/api/admin/usage?days=400')->assertUnprocessable()->assertJsonValidationErrors('days');
    }

    public function test_a_non_admin_cannot_see_usage(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/admin/usage')->assertForbidden();
    }
}
