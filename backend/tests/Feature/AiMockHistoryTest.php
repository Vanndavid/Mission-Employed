<?php

namespace Tests\Feature;

use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Past mock interviews, so a candidate can go back over what they said and
 * what the report made of it. The transcript and report were already stored;
 * this is the way back to them.
 */
class AiMockHistoryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->premium()->create();
    }

    private function mockWithMessages(User $user, int $messages = 2, array $attributes = []): AiSession
    {
        $session = AiSession::factory()->for($user)->kind('mock')->create($attributes);

        for ($i = 1; $i <= $messages; $i++) {
            AiMessage::factory()->for($session, 'session')->atSequence($i)->create([
                'role' => $i % 2 ? 'model' : 'user',
            ]);
        }

        return $session;
    }

    public function test_it_requires_a_token(): void
    {
        $this->getJson('/api/ai/mock/sessions')->assertUnauthorized();
    }

    public function test_a_free_user_is_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/ai/mock/sessions')
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');
    }

    public function test_it_lists_the_users_mock_interviews_newest_first(): void
    {
        $older = $this->mockWithMessages($this->user, 2, [
            'context' => ['company' => 'Acme', 'role' => 'Backend Engineer'],
            'created_at' => now()->subDays(2),
        ]);
        $newer = $this->mockWithMessages($this->user, 4, [
            'context' => null,
            'report' => ['text' => 'FINAL VERDICT: Hire', 'generatedAt' => now()->toJSON()],
            'created_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($this->user);

        $this->getJson('/api/ai/mock/sessions')
            ->assertOk()
            ->assertJsonCount(2, 'sessions')
            ->assertJsonPath('sessions.0.id', $newer->id)
            ->assertJsonPath('sessions.0.messageCount', 4)
            ->assertJsonPath('sessions.0.hasReport', true)
            ->assertJsonPath('sessions.1.id', $older->id)
            ->assertJsonPath('sessions.1.context.company', 'Acme')
            ->assertJsonPath('sessions.1.messageCount', 2)
            ->assertJsonPath('sessions.1.hasReport', false)
            // A list, not a dump: transcripts are fetched one at a time.
            ->assertJsonMissingPath('sessions.0.messages')
            ->assertJsonMissingPath('sessions.0.report');
    }

    public function test_it_leaves_out_other_users_other_kinds_and_interviews_never_started(): void
    {
        $mine = $this->mockWithMessages($this->user);
        $this->mockWithMessages(User::factory()->premium()->create());
        AiSession::factory()->for($this->user)->kind('coding')->create();
        // Opened and abandoned before the interviewer said a word.
        AiSession::factory()->for($this->user)->kind('mock')->create();

        Sanctum::actingAs($this->user);

        $this->getJson('/api/ai/mock/sessions')
            ->assertOk()
            ->assertJsonCount(1, 'sessions')
            ->assertJsonPath('sessions.0.id', $mine->id);
    }

    public function test_reading_a_session_back_includes_its_report(): void
    {
        $session = $this->mockWithMessages($this->user, 2, [
            'report' => ['text' => 'FINAL VERDICT: Hire', 'generatedAt' => '2026-09-27T10:00:00.000000Z'],
        ]);

        Sanctum::actingAs($this->user);

        $this->getJson("/api/ai/sessions/{$session->id}")
            ->assertOk()
            ->assertJsonPath('session.report.text', 'FINAL VERDICT: Hire')
            ->assertJsonCount(2, 'session.messages');
    }

    public function test_it_deletes_an_interview_and_its_transcript(): void
    {
        $session = $this->mockWithMessages($this->user);

        Sanctum::actingAs($this->user);

        $this->deleteJson("/api/ai/mock/sessions/{$session->id}")->assertNoContent();

        $this->assertModelMissing($session);
        $this->assertSame(0, AiMessage::count());
    }

    public function test_another_users_interview_cannot_be_deleted(): void
    {
        $session = $this->mockWithMessages(User::factory()->premium()->create());

        Sanctum::actingAs($this->user);

        $this->deleteJson("/api/ai/mock/sessions/{$session->id}")->assertNotFound();
        $this->assertModelExists($session);
    }

    public function test_a_session_of_another_kind_cannot_be_deleted_through_the_mock_route(): void
    {
        $session = AiSession::factory()->for($this->user)->kind('coding')->create();

        Sanctum::actingAs($this->user);

        $this->deleteJson("/api/ai/mock/sessions/{$session->id}")->assertNotFound();
        $this->assertModelExists($session);
    }
}
