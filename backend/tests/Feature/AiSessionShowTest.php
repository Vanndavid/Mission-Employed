<?php

namespace Tests\Feature;

use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reading a session back is what lets a refresh resume a conversation instead
 * of starting one. Without it, moving sessions out of the Express in-memory Map
 * would have bought durability the client could never reach.
 */
class AiSessionShowTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_requires_a_token(): void
    {
        $session = AiSession::factory()->create();

        $this->getJson("/api/ai/sessions/{$session->id}")->assertUnauthorized();
    }

    public function test_a_free_user_is_refused(): void
    {
        $user = User::factory()->create();
        $session = AiSession::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $this->getJson("/api/ai/sessions/{$session->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');
    }

    public function test_it_returns_the_session_with_its_transcript_in_order(): void
    {
        $user = User::factory()->premium()->create();
        $session = AiSession::factory()->for($user)->kind('mock')->create();

        // Created out of order on purpose: sequence decides, not insertion.
        AiMessage::factory()->for($session, 'session')->atSequence(1)->create([
            'role' => 'model',
            'content' => 'Tell me about a failure.',
        ]);
        AiMessage::factory()->for($session, 'session')->atSequence(0)->create([
            'role' => 'user',
            'content' => 'Ready when you are.',
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/ai/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('session.id', $session->id)
            ->assertJsonPath('session.kind', 'mock')
            ->assertJsonCount(2, 'session.messages')
            ->assertJsonPath('session.messages.0.content', 'Ready when you are.')
            ->assertJsonPath('session.messages.1.content', 'Tell me about a failure.');
    }

    /**
     * Someone else's session must look like it does not exist. A 403 would
     * confirm the id is real.
     */
    public function test_another_users_session_is_not_found(): void
    {
        $session = AiSession::factory()->create();

        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson("/api/ai/sessions/{$session->id}")->assertNotFound();
    }

    public function test_a_missing_session_is_not_found(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/ai/sessions/999999')->assertNotFound();
    }
}
