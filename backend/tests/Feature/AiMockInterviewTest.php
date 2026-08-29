<?php

namespace Tests\Feature;

use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiMockInterviewTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();

        $this->user = User::factory()->premium()->create();
        Sanctum::actingAs($this->user);
    }

    private function openSession(): AiSession
    {
        $this->postJson('/api/ai/mock/sessions', [
            'companyContext' => [
                'company' => 'Acme',
                'role' => 'Senior SWE',
                'jobDescription' => 'Maintain the billing platform.',
                'facts' => 'Led the queue migration.',
            ],
        ])->assertCreated();

        return AiSession::sole();
    }

    public function test_it_opens_a_mock_session_carrying_the_company_context(): void
    {
        $gemini = FakeGeminiService::swap();

        $session = $this->openSession();

        // Opening a session is bookkeeping; the first question comes from the
        // first turn, exactly as the Node version worked.
        $gemini->assertNothingSent();

        $this->assertSame('mock', $session->kind);
        $this->assertSame($this->user->id, $session->user_id);
        $this->assertSame('Acme', $session->context['company']);

        $this->assertSame(
            "You are a Senior Recruiter conducting a behavioral interview.\n".
            "Company: Acme\nRole: Senior SWE\nJD: Maintain the billing platform.\n".
            "Candidate facts: Led the queue migration.\n",
            $session->system_instruction,
        );
    }

    public function test_a_blank_company_context_is_stored_as_null(): void
    {
        FakeGeminiService::swap();

        $this->postJson('/api/ai/mock/sessions', [
            'companyContext' => ['company' => '', 'role' => '', 'jobDescription' => '', 'facts' => ''],
        ])->assertCreated();

        $session = AiSession::sole();

        $this->assertNull($session->context);
        $this->assertSame(
            'You are a Senior Recruiter conducting a behavioral interview.',
            $session->system_instruction,
        );
    }

    public function test_turns_replay_the_stored_transcript_and_append_both_sides(): void
    {
        $gemini = FakeGeminiService::swap();
        $session = $this->openSession();

        // Opening turn: no audio, so no transcription instruction and nothing
        // to store on the candidate's side.
        $gemini->queueJson(['transcript' => '', 'nextPrompt' => 'Tell me about a conflict you resolved.']);

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", [])
            ->assertOk()
            ->assertExactJson(['transcript' => '', 'nextPrompt' => 'Tell me about a conflict you resolved.']);

        $opening = $gemini->lastCall('generateJsonFromParts');

        $this->assertCount(1, $opening['parts']);
        $this->assertStringNotContainsString('First, transcribe the user audio.', $opening['prompt']);
        $this->assertStringContainsString('You are a Senior Recruiter conducting a behavioral interview.', $opening['prompt']);
        $this->assertStringContainsString('LOGIC:', $opening['prompt']);
        $this->assertStringContainsString('RESPONSE FORMAT (JSON):', $opening['prompt']);

        $this->assertSame([[1, 'model', 'Tell me about a conflict you resolved.']], $this->stored($session));

        // Second turn: spoken answer.
        $gemini->queueJson([
            'transcript' => 'I mediated between two teams.',
            'nextPrompt' => 'What was the measurable result?',
        ]);

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", ['audioBase64' => 'YXVkaW8='])
            ->assertOk()
            ->assertJsonPath('transcript', 'I mediated between two teams.');

        $call = $gemini->lastCall('generateJsonFromParts');

        $this->assertSame(
            ['inlineData' => ['mimeType' => 'audio/webm', 'data' => 'YXVkaW8=']],
            $call['parts'][0],
        );
        $this->assertStringContainsString('First, transcribe the user audio.', $call['prompt']);
        // The transcript came out of ai_messages, not out of the request body.
        $this->assertStringContainsString(
            "Interview History:\nInterviewer: Tell me about a conflict you resolved.",
            $call['prompt'],
        );

        $this->assertSame([
            'type' => 'OBJECT',
            'properties' => [
                'transcript' => ['type' => 'STRING'],
                'nextPrompt' => ['type' => 'STRING'],
            ],
            'required' => ['transcript', 'nextPrompt'],
        ], $call['responseSchema']);

        $this->assertSame([
            [1, 'model', 'Tell me about a conflict you resolved.'],
            [2, 'user', 'I mediated between two teams.'],
            [3, 'model', 'What was the measurable result?'],
        ], $this->stored($session));
    }

    public function test_a_typed_answer_is_added_to_the_transcript(): void
    {
        $gemini = FakeGeminiService::swap();
        $session = $this->openSession();

        $gemini->queueJson(['transcript' => '', 'nextPrompt' => 'And the outcome?']);

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", ['answer' => 'I rewrote the retry logic.'])
            ->assertOk();

        $this->assertStringContainsString('User: I rewrote the retry logic.', $gemini->lastCall('generateJsonFromParts')['prompt']);

        $this->assertSame([
            [1, 'user', 'I rewrote the retry logic.'],
            [2, 'model', 'And the outcome?'],
        ], $this->stored($session));
    }

    public function test_it_writes_a_report_from_the_whole_transcript(): void
    {
        $gemini = FakeGeminiService::swap();
        $session = $this->openSession();

        AiMessage::factory()->for($session, 'session')->create(['role' => 'model', 'content' => 'Tell me about a conflict.', 'sequence' => 1]);
        AiMessage::factory()->for($session, 'session')->create(['role' => 'user', 'content' => 'I mediated between two teams.', 'sequence' => 2]);

        $gemini->queueText('**FINAL VERDICT**: Borderline');

        $this->postJson("/api/ai/mock/sessions/{$session->id}/report")
            ->assertOk()
            ->assertExactJson(['report' => '**FINAL VERDICT**: Borderline']);

        $gemini->assertCallCount('generateText', 1)
            ->assertPromptContains('Analyze this behavioral mock interview transcript and produce a hiring decision report.')
            // The report labels the candidate "Candidate", the turn prompt
            // labels them "User". That difference is in the Node original.
            ->assertPromptContains("Interviewer: Tell me about a conflict.\nCandidate: I mediated between two teams.")
            ->assertPromptContains("\nFacts: Led the queue migration.\n")
            ->assertPromptContains('5. **ELITE ADJUSTMENTS** (specific improvements before real interview)');

        $this->assertSame('**FINAL VERDICT**: Borderline', $session->fresh()->report['text']);
    }

    public function test_another_users_mock_session_is_not_found(): void
    {
        $gemini = FakeGeminiService::swap();

        $session = AiSession::factory()->kind('mock')->for(User::factory()->premium()->create())->create();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", [])->assertNotFound();
        $this->postJson("/api/ai/mock/sessions/{$session->id}/report")->assertNotFound();

        $gemini->assertNothingSent();
    }

    public function test_a_coding_session_is_not_reachable_through_the_mock_routes(): void
    {
        $gemini = FakeGeminiService::swap();

        $session = AiSession::factory()->kind('coding')->for($this->user)->create();

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", [])->assertNotFound();
        $this->postJson("/api/ai/mock/sessions/{$session->id}/report")->assertNotFound();

        $gemini->assertNothingSent();
    }

    public function test_a_failed_turn_persists_nothing(): void
    {
        $gemini = FakeGeminiService::swap();
        $session = $this->openSession();

        $gemini->throwOn('generateJson');

        $this->postJson("/api/ai/mock/sessions/{$session->id}/turns", ['audioBase64' => 'YXVkaW8='])
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        $this->assertSame([], $this->stored($session));
    }

    /** @return list<array{0: int, 1: string, 2: string}> */
    private function stored(AiSession $session): array
    {
        return $session->messages()->get()
            ->map(fn (AiMessage $m) => [$m->sequence, $m->role, $m->content])
            ->all();
    }
}
