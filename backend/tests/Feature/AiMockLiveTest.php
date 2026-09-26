<?php

namespace Tests\Feature;

use App\Http\Controllers\Ai\AiController;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The spoken mock interview runs over Gemini Live, straight from the browser.
 * Laravel still owns everything that matters: who may open a connection, the
 * instructions it is locked to, and the transcript that resume and the report
 * read back.
 */
class AiMockLiveTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->premium()->create();
        Sanctum::actingAs($this->user);
    }

    private function mockSession(): AiSession
    {
        return AiSession::factory()->kind('mock')->for($this->user)->create([
            'system_instruction' => "You are a Senior Recruiter conducting a behavioral interview.\nCompany: Acme\n",
        ]);
    }

    /** @return list<array{0: int, 1: string, 2: string}> */
    private function stored(AiSession $session): array
    {
        return $session->messages()->get()
            ->map(fn (AiMessage $message) => [$message->sequence, $message->role, $message->content])
            ->all();
    }

    public function test_it_mints_a_token_locked_to_the_sessions_interviewer(): void
    {
        $gemini = FakeGeminiService::swap();
        $session = $this->mockSession();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/live")
            ->assertOk()
            ->assertExactJson([
                'token' => 'auth_tokens/fake',
                'model' => 'models/gemini-3.8-live',
                'history' => [],
            ]);

        $instruction = $gemini->lastCall('createLiveToken')['systemInstruction'];

        // The stored persona and company context, plus how to run a spoken interview.
        $this->assertStringStartsWith($session->system_instruction, $instruction);
        $this->assertStringContainsString('Ask one question at a time', $instruction);
        $this->assertStringContainsString('ask a specific follow-up', $instruction);
        // Near-silence gets transcribed as a stray phrase, sometimes in another
        // language; the interviewer should ask again in English, not follow it.
        $this->assertStringContainsString('Conduct the interview in English', $instruction);
        $this->assertStringContainsString("say you didn't catch it and ask them to repeat it", $instruction);

        $this->assertSame([], $this->stored($session));
    }

    public function test_the_stored_transcript_comes_back_for_replay(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        AiMessage::factory()->for($session, 'session')->create(['role' => 'model', 'content' => 'Tell me about a conflict.', 'sequence' => 1]);
        AiMessage::factory()->for($session, 'session')->create(['role' => 'user', 'content' => 'I mediated between two teams.', 'sequence' => 2]);

        $this->postJson("/api/ai/mock/sessions/{$session->id}/live")
            ->assertOk()
            ->assertJsonPath('history', [
                ['role' => 'model', 'content' => 'Tell me about a conflict.'],
                ['role' => 'user', 'content' => 'I mediated between two teams.'],
            ]);
    }

    public function test_the_replay_is_capped_to_the_same_window_as_text_turns(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        foreach (range(1, AiController::HISTORY_LIMIT + 5) as $sequence) {
            AiMessage::factory()->for($session, 'session')->create([
                'role' => $sequence % 2 ? 'model' : 'user',
                'content' => "Turn {$sequence}",
                'sequence' => $sequence,
            ]);
        }

        $history = $this->postJson("/api/ai/mock/sessions/{$session->id}/live")->assertOk()->json('history');

        $this->assertCount(AiController::HISTORY_LIMIT, $history);
        $this->assertSame('Turn 6', $history[0]['content']);
    }

    public function test_a_failed_mint_is_a_clean_502(): void
    {
        $gemini = FakeGeminiService::swap();
        $gemini->throwOn('createLiveToken', GeminiException::fromStatus(400, 'models/gemini-3.8-live', 'secret upstream detail'));

        $session = $this->mockSession();

        $response = $this->postJson("/api/ai/mock/sessions/{$session->id}/live")
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        $this->assertStringNotContainsString('secret upstream detail', $response->getContent());
    }

    public function test_an_exchange_appends_the_answer_and_the_reply(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        AiMessage::factory()->for($session, 'session')->create(['role' => 'model', 'content' => 'Tell me about a conflict.', 'sequence' => 1]);

        $this->postJson("/api/ai/mock/sessions/{$session->id}/exchanges", [
            'answer' => '  I mediated between two teams.  ',
            'reply' => 'What was the result?',
        ])->assertCreated();

        $this->assertSame([
            [1, 'model', 'Tell me about a conflict.'],
            [2, 'user', 'I mediated between two teams.'],
            [3, 'model', 'What was the result?'],
        ], $this->stored($session));
    }

    public function test_the_opening_question_is_stored_without_an_answer(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/exchanges", [
            'answer' => '',
            'reply' => 'Hello, tell me about yourself.',
        ])->assertCreated();

        $this->assertSame([[1, 'model', 'Hello, tell me about yourself.']], $this->stored($session));
    }

    public function test_an_answer_the_interviewer_never_replied_to_is_still_kept(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        // Interrupted, or the connection dropped mid-reply: the answer happened.
        $this->postJson("/api/ai/mock/sessions/{$session->id}/exchanges", [
            'answer' => 'I rewrote the retry logic.',
            'reply' => null,
        ])->assertCreated();

        $this->assertSame([[1, 'user', 'I rewrote the retry logic.']], $this->stored($session));
    }

    public function test_an_empty_exchange_is_rejected(): void
    {
        FakeGeminiService::swap();
        $session = $this->mockSession();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/exchanges", ['answer' => ' ', 'reply' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reply');

        $this->assertSame([], $this->stored($session));
    }

    public function test_someone_elses_session_and_a_coding_session_are_not_found(): void
    {
        $gemini = FakeGeminiService::swap();

        $theirs = AiSession::factory()->kind('mock')->for(User::factory()->premium()->create())->create();
        $coding = AiSession::factory()->kind('coding')->for($this->user)->create();

        foreach ([$theirs, $coding] as $session) {
            $this->postJson("/api/ai/mock/sessions/{$session->id}/live")->assertNotFound();
            $this->postJson("/api/ai/mock/sessions/{$session->id}/exchanges", ['reply' => 'Hi'])->assertNotFound();
        }

        $gemini->assertNothingSent();
        $this->assertSame(0, AiMessage::count());
    }

    public function test_a_free_account_cannot_open_a_live_connection(): void
    {
        $gemini = FakeGeminiService::swap();

        $free = User::factory()->create();
        Sanctum::actingAs($free);

        $session = AiSession::factory()->kind('mock')->for($free)->create();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/live")->assertForbidden();

        $gemini->assertNothingSent();
    }
}
