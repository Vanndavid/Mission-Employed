<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiJobParseTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Sanctum::actingAs(User::factory()->premium()->create());
    }

    public function test_it_parses_a_job_description_into_tracker_fields(): void
    {
        $gemini = FakeGeminiService::swap()->queueJson([
            'company' => 'Acme',
            'role' => 'Senior SWE',
            'location' => 'Remote',
            'url' => '',
            'notes' => 'Referred by a friend',
        ]);

        $this->postJson('/api/ai/job/parse', ['text' => 'Applied to Acme as a Senior SWE, remote.'])
            ->assertOk()
            ->assertExactJson([
                'company' => 'Acme',
                'role' => 'Senior SWE',
                'location' => 'Remote',
                // Blank and missing optional fields are null, because the
                // tracker columns are nullable and '' is not "no value".
                'url' => null,
                'notes' => 'Referred by a friend',
                'jobDescription' => null,
            ]);

        $gemini->assertCallCount('generateJson', 1)
            ->assertPromptContains('Parse this natural-language job application log into structured fields.')
            ->assertPromptContains('Input: "Applied to Acme as a Senior SWE, remote."')
            ->assertPromptContains('Return JSON with: company, role, location (optional), url (optional), notes, jobDescription (if mentioned).');

        $schema = $gemini->lastCall('generateJson')['responseSchema'];

        $this->assertSame('OBJECT', $schema['type']);
        $this->assertSame(['company', 'role', 'location', 'url', 'notes', 'jobDescription'], array_keys($schema['properties']));
        $this->assertSame(['company', 'role'], $schema['required']);

        // Criteria scoring was cut with the feature that used it.
        $this->assertStringNotContainsString('criteria', strtolower($gemini->lastCall('generateJson')['prompt']));
    }

    public function test_it_requires_something_to_parse(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/job/parse', ['text' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('text');

        $gemini->assertNothingSent();
    }

    public function test_a_free_user_cannot_parse(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/job/parse', ['text' => 'Applied to Acme.'])
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }
}
