<?php

namespace Tests\Feature;

use App\Http\Controllers\Ai\AiController;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The unified chat turn: POST /api/ai/sessions/{session}/messages.
 *
 * The point of this endpoint is that the transcript lives in the database
 * rather than in an Express `Map`, so the tests below care most about what gets
 * replayed to the model on the second turn.
 */
class AiSessionMessageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    private function premium(): User
    {
        $user = User::factory()->premium()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    private function chatSession(User $user, string $kind = 'coding'): AiSession
    {
        return AiSession::factory()->for($user)->kind($kind)->create([
            'system_instruction' => 'You are a world-class technical interviewer and mentor.',
        ]);
    }

    public function test_a_multi_turn_session_replays_its_stored_history(): void
    {
        $user = $this->premium();
        $session = $this->chatSession($user);

        $gemini = FakeGeminiService::swap()->queueChat('Start with the brute force.', 'Now reduce it to O(n).');

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'How do I start?'])
            ->assertOk()
            ->assertJsonPath('text', 'Start with the brute force.')
            ->assertJsonPath('message.role', 'user')
            ->assertJsonPath('message.sequence', 1)
            ->assertJsonPath('reply.role', 'model')
            ->assertJsonPath('reply.sequence', 2);

        // First turn: only the message just sent.
        $this->assertSame(
            [['role' => 'user', 'content' => 'How do I start?']],
            $gemini->calls('chat')[0]['messages'],
        );

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'Here is my O(n^2) attempt.'])
            ->assertOk()
            ->assertJsonPath('text', 'Now reduce it to O(n).');

        // Second turn: the whole conversation, oldest first, ending on the new
        // user turn — not a fresh chat.
        $this->assertSame([
            ['role' => 'user', 'content' => 'How do I start?'],
            ['role' => 'model', 'content' => 'Start with the brute force.'],
            ['role' => 'user', 'content' => 'Here is my O(n^2) attempt.'],
        ], $gemini->calls('chat')[1]['messages']);

        // The persona is resent every turn as the system instruction.
        $this->assertSame(
            'You are a world-class technical interviewer and mentor.',
            $gemini->calls('chat')[1]['systemInstruction'],
        );

        $this->assertSame(
            [[1, 'user'], [2, 'model'], [3, 'user'], [4, 'model']],
            $session->messages()->get()->map(fn (AiMessage $m) => [$m->sequence, $m->role])->all(),
        );
    }

    public function test_another_users_session_is_not_found(): void
    {
        $this->premium();
        $session = $this->chatSession(User::factory()->premium()->create());

        $gemini = FakeGeminiService::swap();

        // 404, not 403: the existence of someone else's session is not ours to
        // confirm.
        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'hello'])
            ->assertNotFound();

        $gemini->assertNothingSent();
        $this->assertSame(0, $session->messages()->count());
    }

    public function test_a_mock_session_is_sent_to_its_own_turn_endpoint(): void
    {
        $user = $this->premium();
        $session = $this->chatSession($user, 'mock');

        $gemini = FakeGeminiService::swap();

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'hello'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'wrong_session_kind');

        $gemini->assertNothingSent();
    }

    public function test_a_failed_turn_persists_nothing(): void
    {
        $user = $this->premium();
        $session = $this->chatSession($user);

        FakeGeminiService::swap()->throwOn('chat');

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'How do I start?'])
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        // A dangling user turn would be replayed forever on every later turn.
        $this->assertSame(0, $session->messages()->count());
    }

    public function test_it_requires_a_message(): void
    {
        $user = $this->premium();
        $session = $this->chatSession($user);

        $gemini = FakeGeminiService::swap();

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('message');

        $gemini->assertNothingSent();
    }

    public function test_it_replays_at_most_the_history_window(): void
    {
        $user = $this->premium();
        $session = $this->chatSession($user);

        // One turn past the cap, so the oldest exchange falls out of the window.
        $total = AiController::HISTORY_LIMIT + 2;

        for ($sequence = 1; $sequence <= $total; $sequence++) {
            AiMessage::factory()->for($session, 'session')->create([
                'role' => $sequence % 2 === 1 ? 'user' : 'model',
                'content' => "turn {$sequence}",
                'sequence' => $sequence,
            ]);
        }

        $gemini = FakeGeminiService::swap()->queueChat('ok');

        $this->postJson("/api/ai/sessions/{$session->id}/messages", ['message' => 'latest'])->assertOk();

        $sent = $gemini->lastCall('chat')['messages'];

        $this->assertCount(AiController::HISTORY_LIMIT + 1, $sent);
        $this->assertSame('turn 3', $sent[0]['content']);
        $this->assertSame('latest', $sent[count($sent) - 1]['content']);
    }
}
