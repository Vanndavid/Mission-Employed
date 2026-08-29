<?php

namespace Tests\Feature;

use App\Models\BehavioralAnswer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BehavioralAnswerApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_behavioral_answers_require_a_token(): void
    {
        $this->getJson('/api/behavioral-answers')->assertUnauthorized();
        $this->putJson('/api/behavioral-answers/failure', ['bullets' => ['a']])->assertUnauthorized();
    }

    public function test_it_lists_only_the_signed_in_users_answers(): void
    {
        $user = User::factory()->create();
        BehavioralAnswer::factory()->for($user)->theme('failure')->create(['bullets' => ['Mine']]);
        BehavioralAnswer::factory()->theme('failure')->create(['bullets' => ['Theirs']]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/behavioral-answers')->assertOk();

        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.themeId', 'failure');
        $response->assertJsonPath('data.0.bullets', ['Mine']);
    }

    public function test_it_saves_an_answer_for_a_theme(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // A first save creates the row, so the resource response is a 201.
        $this->putJson('/api/behavioral-answers/pressure', ['bullets' => ['Shipped under a deadline']])
            ->assertCreated()
            ->assertJsonPath('data.themeId', 'pressure')
            ->assertJsonPath('data.bullets', ['Shipped under a deadline']);

        $this->assertDatabaseHas('behavioral_answers', [
            'user_id' => $user->id,
            'theme_id' => 'pressure',
        ]);
    }

    public function test_saving_the_same_theme_twice_edits_in_place(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/behavioral-answers/weakness', ['bullets' => ['First pass']])->assertCreated();
        // The second save edits the same row, so 200 rather than another 201.
        $this->putJson('/api/behavioral-answers/weakness', ['bullets' => ['Rewritten', 'Second bullet']])
            ->assertOk()
            ->assertJsonPath('data.bullets', ['Rewritten', 'Second bullet']);

        // updateOrCreate on (user_id, theme_id): one row, not a pile of them.
        $this->assertDatabaseCount('behavioral_answers', 1);
        $this->assertSame(['Rewritten', 'Second bullet'], BehavioralAnswer::sole()->bullets);
    }

    public function test_saving_a_theme_does_not_touch_another_users_row(): void
    {
        $user = User::factory()->create();
        $theirs = BehavioralAnswer::factory()->theme('impact')->create(['bullets' => ['Theirs']]);

        Sanctum::actingAs($user);

        $this->putJson('/api/behavioral-answers/impact', ['bullets' => ['Mine']])->assertCreated();

        $this->assertSame(['Theirs'], $theirs->fresh()->bullets);
        $this->assertDatabaseCount('behavioral_answers', 2);
    }

    public function test_it_rejects_an_unknown_theme_id(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/behavioral-answers/not-a-theme', ['bullets' => ['x']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('themeId');

        $this->assertDatabaseCount('behavioral_answers', 0);
    }

    public function test_it_requires_bullets(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/behavioral-answers/challenge', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('bullets');
    }
}
