<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiCodingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Belt and braces: FakeGeminiService never opens a socket, but if a
        // binding were ever missed this turns a silent live call into a failure.
        Http::preventStrayRequests();
    }

    private function premium(): User
    {
        $user = User::factory()->premium()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_it_generates_a_coding_problem_with_the_ported_prompt_and_schema(): void
    {
        $this->premium();

        $gemini = FakeGeminiService::swap()->queueJson([
            'title' => 'Two Sum',
            'description' => 'Find two numbers that add to a target.',
            'examples' => ['[2,7,11,15], 9 -> [0,1]', ''],
            'topics' => ['Arrays', 'Hash Maps'],
        ]);

        $response = $this->postJson('/api/ai/coding/problem', ['difficulty' => 'medium']);

        $response->assertOk()->assertExactJson([
            'title' => 'Two Sum',
            'description' => 'Find two numbers that add to a target.',
            // The blank example is dropped rather than handed to the client.
            'examples' => ['[2,7,11,15], 9 -> [0,1]'],
            'topics' => ['Arrays', 'Hash Maps'],
        ]);

        $gemini->assertCallCount('generateJson', 1)
            ->assertPromptContains('Generate a programming problem for interview practice.')
            ->assertPromptContains('Difficulty: medium.')
            ->assertPromptContains('Topics: Arrays, Strings, Hash Maps, Trees, Graphs, SQL, or Dynamic Programming as appropriate.');

        // Type.OBJECT / Type.STRING are plain strings over REST.
        $this->assertSame([
            'type' => 'OBJECT',
            'properties' => [
                'title' => ['type' => 'STRING'],
                'description' => ['type' => 'STRING'],
                'examples' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'topics' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
            ],
            'required' => ['title', 'description', 'examples', 'topics'],
        ], $gemini->lastCall('generateJson')['responseSchema']);
    }

    public function test_a_missing_difficulty_defaults_to_easy(): void
    {
        $this->premium();

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/problem', [])->assertOk();

        $gemini->assertPromptContains('Difficulty: easy.');
    }

    public function test_it_rejects_an_unknown_difficulty(): void
    {
        $this->premium();

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/problem', ['difficulty' => 'impossible'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('difficulty');

        $gemini->assertNothingSent();
    }

    public function test_a_free_user_is_refused_by_the_premium_gate(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/problem', ['difficulty' => 'easy'])
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }

    public function test_an_admin_without_a_premium_plan_passes_the_gate(): void
    {
        // isPremium() is "premium plan OR admin", and the gate must match it.
        $admin = User::factory()->admin()->create(['plan' => AccountPlan::Free]);
        Sanctum::actingAs($admin);

        FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/problem', ['difficulty' => 'easy'])->assertOk();
    }

    public function test_the_ai_routes_are_closed_to_anonymous_callers(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/problem', ['difficulty' => 'easy'])->assertUnauthorized();

        $gemini->assertNothingSent();
    }

    public function test_a_gemini_failure_never_leaks_the_upstream_body(): void
    {
        $this->premium();

        FakeGeminiService::swap()->throwOn(
            'generateJson',
            GeminiException::fromStatus(429, 'gemini-2.0-flash', '{"error":{"message":"QUOTA_EXCEEDED for project 12345"}}'),
        );

        $response = $this->postJson('/api/ai/coding/problem', ['difficulty' => 'easy']);

        $response->assertStatus(502)->assertExactJson([
            'message' => 'The AI service is unavailable right now. Please try again in a moment.',
            'code' => 'ai_unavailable',
        ]);

        $body = $response->getContent();

        foreach (['QUOTA_EXCEEDED', '12345', 'gemini-2.0-flash', 'Gemini', '429'] as $leak) {
            $this->assertStringNotContainsString($leak, $body);
        }
    }

    public function test_it_opens_a_tutor_session_without_calling_the_model(): void
    {
        $user = $this->premium();

        $gemini = FakeGeminiService::swap();

        $response = $this->postJson('/api/ai/coding/sessions', [
            'problemTitle' => 'Two Sum',
            'problemDescription' => 'Find two numbers that add to a target.',
        ]);

        $response->assertCreated()
            ->assertJsonPath('session.kind', 'coding')
            ->assertJsonPath('session.context.problemTitle', 'Two Sum')
            ->assertJsonPath('session.messages', []);

        // The Node handler only built a chat object; the student speaks first.
        $gemini->assertNothingSent();

        $session = AiSession::sole();

        $this->assertSame($user->id, $session->user_id);
        $this->assertStringContainsString(
            'You are a world-class technical interviewer and mentor.',
            $session->system_instruction,
        );
        $this->assertStringContainsString('"Two Sum"', $session->system_instruction);
        $this->assertStringContainsString('Do NOT give the full solution immediately.', $session->system_instruction);
    }

    public function test_opening_a_session_requires_a_problem(): void
    {
        $this->premium();

        FakeGeminiService::swap();

        $this->postJson('/api/ai/coding/sessions', ['problemTitle' => 'Two Sum'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('problemDescription');
    }
}
