<?php

namespace Tests\Feature;

use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiDocumentTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, string> */
    private array $payload = [
        'company' => 'Acme',
        'role' => 'Senior SWE',
        'jobDescription' => 'Maintain the billing platform.',
        'cv' => 'Ten years of backend work.',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Sanctum::actingAs(User::factory()->premium()->create());
    }

    public function test_it_writes_a_cover_letter(): void
    {
        $gemini = FakeGeminiService::swap()->queueText('Dear hiring team, ...');

        $this->postJson('/api/ai/cover-letter/generate', $this->payload + [
            'template' => 'Warm but brief',
            'portfolioUrl' => 'https://example.test',
        ])->assertOk()->assertExactJson(['text' => 'Dear hiring team, ...']);

        $gemini->assertCallCount('generateText', 1)
            ->assertPromptContains('Write a tailored cover letter for:')
            ->assertPromptContains('Company: Acme')
            ->assertPromptContains('Candidate CV summary: Ten years of backend work.')
            ->assertPromptContains('Portfolio: https://example.test')
            ->assertPromptContains('Template/style notes: Warm but brief')
            ->assertPromptContains('Keep it under 350 words. No placeholder brackets.');
    }

    public function test_the_cover_letter_falls_back_to_the_ported_defaults(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/cover-letter/generate', $this->payload)->assertOk();

        $gemini->assertPromptContains('Portfolio: N/A')
            ->assertPromptContains('Template/style notes: Professional, concise, maintenance SWE tone');
    }

    public function test_it_tailors_a_cv(): void
    {
        $gemini = FakeGeminiService::swap()->queueText('JANE DOE — Senior SWE');

        $this->postJson('/api/ai/cv/generate', $this->payload)
            ->assertOk()
            ->assertExactJson(['text' => 'JANE DOE — Senior SWE']);

        $gemini->assertCallCount('generateText', 1)
            ->assertPromptContains("Tailor this candidate's CV for a specific job application.")
            ->assertPromptContains('Base CV: Ten years of backend work.')
            ->assertPromptContains('Tailoring instructions: Reorder and emphasize relevant experience. Match keywords from the JD. Keep all facts truthful — do not invent experience. One page, ATS-friendly plain text.')
            ->assertPromptContains('Return the full tailored CV as plain text. No placeholder brackets. Preserve contact details from the base CV.');
    }

    public function test_both_documents_need_a_company_and_a_role(): void
    {
        $gemini = FakeGeminiService::swap();

        foreach (['/api/ai/cover-letter/generate', '/api/ai/cv/generate'] as $route) {
            $this->postJson($route, ['jobDescription' => 'x', 'cv' => 'y'])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['company', 'role']);
        }

        $gemini->assertNothingSent();
    }

    public function test_both_documents_need_a_job_description_and_a_cv(): void
    {
        $gemini = FakeGeminiService::swap();

        foreach (['/api/ai/cover-letter/generate', '/api/ai/cv/generate'] as $route) {
            $this->postJson($route, ['company' => 'Acme', 'role' => 'SWE'])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['jobDescription', 'cv']);
        }

        $gemini->assertNothingSent();
    }

    public function test_it_opens_a_cover_letter_refine_session_without_calling_the_model(): void
    {
        $gemini = FakeGeminiService::swap();

        $response = $this->postJson('/api/ai/cover-letter/sessions', [
            'company' => 'Acme',
            'role' => 'Senior SWE',
            'jobDescription' => 'Maintain the billing platform.',
            'document' => 'Dear hiring team, ...',
        ]);

        $response->assertCreated()
            ->assertJsonPath('session.kind', 'cover_letter')
            ->assertJsonPath('session.messages', []);

        $gemini->assertNothingSent();

        $session = AiSession::findOrFail($response->json('session.id'));
        $this->assertStringContainsString('You help refine cover letters for Senior SWE at Acme.', $session->system_instruction);
        $this->assertStringContainsString('Job Description: Maintain the billing platform.', $session->system_instruction);
        $this->assertStringContainsString('Current letter: Dear hiring team, ...', $session->system_instruction);
        $this->assertStringContainsString('Return the full revised letter.', $session->system_instruction);
    }

    public function test_it_opens_a_cv_refine_session(): void
    {
        $gemini = FakeGeminiService::swap();

        $response = $this->postJson('/api/ai/cv/sessions', [
            'company' => 'Acme',
            'role' => 'Senior SWE',
            'jobDescription' => '',
            'document' => 'JANE DOE — Senior SWE',
        ]);

        $response->assertCreated()->assertJsonPath('session.kind', 'cv');
        $gemini->assertNothingSent();

        $instruction = AiSession::findOrFail($response->json('session.id'))->system_instruction;
        $this->assertStringContainsString('You help refine tailored CVs for Senior SWE at Acme.', $instruction);
        $this->assertStringContainsString('Current CV: JANE DOE — Senior SWE', $instruction);
        $this->assertStringContainsString('Never fabricate experience.', $instruction);
    }

    public function test_a_refine_session_takes_its_turns_through_the_shared_route(): void
    {
        $gemini = FakeGeminiService::swap()->queueChat('JANE DOE — shorter summary');

        $id = $this->postJson('/api/ai/cv/sessions', [
            'company' => 'Acme',
            'role' => 'Senior SWE',
            'document' => 'JANE DOE — Senior SWE',
        ])->assertCreated()->json('session.id');

        $this->postJson("/api/ai/sessions/{$id}/messages", ['message' => 'Shorten the summary.'])
            ->assertOk()
            ->assertJsonPath('text', 'JANE DOE — shorter summary');

        $gemini->assertCalled('chat', fn (array $call) => str_contains(
            (string) $call['systemInstruction'],
            'You help refine tailored CVs for Senior SWE at Acme.',
        ));
    }

    public function test_a_refine_session_needs_the_document_and_who_it_is_for(): void
    {
        foreach (['/api/ai/cover-letter/sessions', '/api/ai/cv/sessions'] as $route) {
            $this->postJson($route, ['jobDescription' => 'x'])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['company', 'role', 'document']);
        }

        $this->assertSame(0, AiSession::count());
    }

    public function test_a_gemini_failure_is_contained(): void
    {
        FakeGeminiService::swap()->throwOn('generateText');

        $response = $this->postJson('/api/ai/cv/generate', $this->payload);

        $response->assertStatus(502)->assertExactJson([
            'message' => 'The AI service is unavailable right now. Please try again in a moment.',
            'code' => 'ai_unavailable',
        ]);
    }
}
