<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiBehavioralTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Sanctum::actingAs(User::factory()->premium()->create());
    }

    public function test_it_asks_for_a_behavioral_question(): void
    {
        $gemini = FakeGeminiService::swap()->queueText('  Tell me about a time you led through conflict.  ');

        $this->postJson('/api/ai/behavioral/prompt', ['theme' => 'Leadership'])
            ->assertOk()
            ->assertExactJson(['text' => 'Tell me about a time you led through conflict.']);

        $gemini->assertCallCount('generateText', 1)->assertPromptContains(
            'Give me a realistic behavioral interview question for the theme: "Leadership". Keep it brief and professional.',
        );
    }

    public function test_it_evaluates_a_spoken_answer_against_saved_facts(): void
    {
        $gemini = FakeGeminiService::swap()->queueJson([
            'transcript' => 'I led the migration off the legacy queue.',
            'feedback' => "### 🎯 Execution Summary\n* Clear result.",
        ]);

        $this->postJson('/api/ai/behavioral/evaluate', [
            'audioBase64' => 'YXVkaW8=',
            'theme' => 'Leadership',
            'prompt' => 'Tell me about a time you led through conflict.',
            'facts' => ['Shipped the queue migration in Q3', '', 'Led a team of four'],
        ])->assertOk()->assertExactJson([
            'transcript' => 'I led the migration off the legacy queue.',
            'feedback' => "### 🎯 Execution Summary\n* Clear result.",
        ]);

        $call = $gemini->lastCall('generateJsonFromParts');

        // Inline audio, not a prose blob: the *FromParts overload is the one
        // that can carry it.
        $this->assertSame(
            ['inlineData' => ['mimeType' => 'audio/webm', 'data' => 'YXVkaW8=']],
            $call['parts'][0],
        );

        $this->assertSame([
            'type' => 'OBJECT',
            'properties' => [
                'transcript' => ['type' => 'STRING'],
                'feedback' => ['type' => 'STRING'],
            ],
            'required' => ['transcript', 'feedback'],
        ], $call['responseSchema']);

        $gemini->assertPromptContains('You are a Lead Recruiter.')
            ->assertPromptContains('Transcribe the user\'s spoken answer to: "Tell me about a time you led through conflict." (Theme: Leadership).')
            ->assertPromptContains('Provide a critical, professional STAR evaluation.')
            ->assertPromptContains("Candidate's saved facts for this theme (use to check consistency and specificity):")
            ->assertPromptContains('- Shipped the queue migration in Q3')
            ->assertPromptContains('- Led a team of four')
            ->assertPromptContains('### ⚖️ Unbiased Critiques');

        // The prose scaffolding the Node version parsed with a regex is gone;
        // the schema does that job. Asking for it again would be a regression.
        $this->assertStringNotContainsString('TRANSCRIPT:', $call['prompt']);
    }

    public function test_the_facts_block_is_omitted_when_there_are_no_facts(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/behavioral/evaluate', [
            'audioBase64' => 'YXVkaW8=',
            'theme' => 'Ownership',
            'prompt' => 'Tell me about a failure.',
        ])->assertOk();

        $this->assertStringNotContainsString(
            "Candidate's saved facts",
            $gemini->lastCall('generateJsonFromParts')['prompt'],
        );
    }

    public function test_it_requires_the_audio(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/behavioral/evaluate', [
            'theme' => 'Ownership',
            'prompt' => 'Tell me about a failure.',
        ])->assertStatus(422)->assertJsonValidationErrors('audioBase64');

        $gemini->assertNothingSent();
    }

    public function test_a_blocked_evaluation_is_a_clean_error(): void
    {
        FakeGeminiService::swap()->throwOn(
            'generateJson',
            GeminiException::blocked('gemini-2.0-flash', 'SAFETY'),
        );

        $response = $this->postJson('/api/ai/behavioral/evaluate', [
            'audioBase64' => 'YXVkaW8=',
            'theme' => 'Ownership',
            'prompt' => 'Tell me about a failure.',
        ]);

        // The Node version did `response.text || ''` here and returned a blank
        // assistant message; a refusal must be visible instead.
        $response->assertStatus(502)->assertJsonPath('code', 'ai_unavailable');

        $this->assertStringNotContainsString('SAFETY', $response->getContent());
    }
}
