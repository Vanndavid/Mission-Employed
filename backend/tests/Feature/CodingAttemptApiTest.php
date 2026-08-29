<?php

namespace Tests\Feature;

use App\Models\CodingAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CodingAttemptApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_coding_history_requires_a_token(): void
    {
        $this->getJson('/api/coding/attempts')->assertUnauthorized();
        $this->postJson('/api/coding/attempts', ['title' => 'Two Sum', 'difficulty' => 'easy'])
            ->assertUnauthorized();
    }

    public function test_it_lists_only_the_signed_in_users_attempts_newest_first(): void
    {
        $user = User::factory()->create();
        CodingAttempt::factory()->for($user)->create([
            'title' => 'Older',
            'attempted_at' => now()->subWeek(),
        ]);
        CodingAttempt::factory()->for($user)->create([
            'title' => 'Newer',
            'attempted_at' => now(),
        ]);
        CodingAttempt::factory()->create(['title' => 'Theirs']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/coding/attempts')->assertOk();

        $response->assertJsonCount(2, 'data');
        $response->assertJsonPath('data.0.title', 'Newer');
        $response->assertJsonPath('data.1.title', 'Older');
    }

    public function test_it_records_an_attempt(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/coding/attempts', [
            'title' => 'Merge Intervals',
            'difficulty' => 'medium',
            'topics' => ['arrays', 'sorting'],
            'completed' => true,
            'date' => '2026-08-20T09:30:00',
        ])->assertCreated();

        $attempt = CodingAttempt::sole();
        $this->assertSame($user->id, $attempt->user_id);
        $this->assertSame(['arrays', 'sorting'], $attempt->topics);
        $this->assertTrue($attempt->completed);
        $this->assertSame('2026-08-20', $attempt->attempted_at->format('Y-m-d'));
        // The client keys the timestamp as `date`, per CodingHistoryEntry.
        $response->assertJsonPath('data.title', 'Merge Intervals');
        $response->assertJsonPath('data.completed', true);
        $response->assertJsonPath('data.topics', ['arrays', 'sorting']);
    }

    public function test_an_attempt_with_no_date_lands_now(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/coding/attempts', [
            'title' => 'Two Sum',
            'difficulty' => 'easy',
            'date' => '',
        ])->assertCreated();

        $attempt = CodingAttempt::sole();
        $this->assertNotNull($attempt->attempted_at);
        $this->assertTrue($attempt->attempted_at->isToday());
        $this->assertFalse($attempt->completed);
        $this->assertSame([], $attempt->topics);
    }

    public function test_it_rejects_an_unknown_difficulty(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/coding/attempts', ['title' => 'Two Sum', 'difficulty' => 'nightmare'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('difficulty');

        $this->postJson('/api/coding/attempts', ['difficulty' => 'easy'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('title');
    }
}
