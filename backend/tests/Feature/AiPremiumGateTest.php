<?php

namespace Tests\Feature;

use App\Models\AiSession;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The premium middleware is the enforcement; PremiumGate on the client is a
 * courtesy. A free user must bounce on every AI route, not just the ones that
 * happened to get a dedicated test when the endpoint was ported.
 *
 * Session-bound routes need a real row: SubstituteBindings runs with the api
 * group, before `premium`, so a missing `{session}` is a 404 that never proves
 * the gate.
 */
class AiPremiumGateTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>, 3: string|null}>
     */
    public static function premiumGatedRoutes(): array
    {
        $document = [
            'company' => 'Acme',
            'role' => 'Senior SWE',
            'jobDescription' => 'Maintain the billing platform.',
            'cv' => 'Ten years of backend work.',
        ];

        return [
            'coding problem' => ['POST', '/api/ai/coding/problem', ['difficulty' => 'easy'], null],
            'coding session' => ['POST', '/api/ai/coding/sessions', [
                'problemTitle' => 'Two Sum',
                'problemDescription' => 'Find two numbers that add to a target.',
            ], null],
            'session show' => ['GET', '/api/ai/sessions/{session}', [], 'coding'],
            'session message' => ['POST', '/api/ai/sessions/{session}/messages', ['message' => 'hello'], 'coding'],
            'behavioral prompt' => ['POST', '/api/ai/behavioral/prompt', ['theme' => 'Leadership'], null],
            'behavioral evaluate' => ['POST', '/api/ai/behavioral/evaluate', [
                'audioBase64' => 'YXVkaW8=',
                'theme' => 'Leadership',
                'prompt' => 'Tell me about a time you led through conflict.',
            ], null],
            'mock session' => ['POST', '/api/ai/mock/sessions', [], null],
            'mock turn' => ['POST', '/api/ai/mock/sessions/{session}/turns', ['answer' => 'I led the migration.'], 'mock'],
            'mock report' => ['POST', '/api/ai/mock/sessions/{session}/report', [], 'mock'],
            'job parse' => ['POST', '/api/ai/job/parse', ['text' => 'Acme is hiring a Senior SWE.'], null],
            'cover letter' => ['POST', '/api/ai/cover-letter/generate', $document, null],
            'cv' => ['POST', '/api/ai/cv/generate', $document, null],
            'tts' => ['POST', '/api/ai/tts', ['text' => 'hello'], null],
        ];
    }

    #[DataProvider('premiumGatedRoutes')]
    public function test_a_free_user_is_refused_on_every_ai_route(
        string $method,
        string $uri,
        array $payload,
        ?string $sessionKind,
    ): void {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        if ($sessionKind !== null) {
            $session = AiSession::factory()->for($user)->kind($sessionKind)->create();
            $uri = str_replace('{session}', (string) $session->id, $uri);
        }

        $gemini = FakeGeminiService::swap();

        $this->json($method, $uri, $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }
}
