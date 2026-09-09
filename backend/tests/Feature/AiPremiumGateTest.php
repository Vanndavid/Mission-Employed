<?php

namespace Tests\Feature;

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
 */
class AiPremiumGateTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>}>
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
            'coding problem' => ['POST', '/api/ai/coding/problem', ['difficulty' => 'easy']],
            'coding session' => ['POST', '/api/ai/coding/sessions', [
                'problemTitle' => 'Two Sum',
                'problemDescription' => 'Find two numbers that add to a target.',
            ]],
            'session show' => ['GET', '/api/ai/sessions/1', []],
            'session message' => ['POST', '/api/ai/sessions/1/messages', ['message' => 'hello']],
            'behavioral prompt' => ['POST', '/api/ai/behavioral/prompt', ['theme' => 'Leadership']],
            'behavioral evaluate' => ['POST', '/api/ai/behavioral/evaluate', [
                'audioBase64' => 'YXVkaW8=',
                'theme' => 'Leadership',
                'prompt' => 'Tell me about a time you led through conflict.',
            ]],
            'mock session' => ['POST', '/api/ai/mock/sessions', []],
            'mock turn' => ['POST', '/api/ai/mock/sessions/1/turns', ['answer' => 'I led the migration.']],
            'mock report' => ['POST', '/api/ai/mock/sessions/1/report', []],
            'job parse' => ['POST', '/api/ai/job/parse', ['text' => 'Acme is hiring a Senior SWE.']],
            'cover letter' => ['POST', '/api/ai/cover-letter/generate', $document],
            'cv' => ['POST', '/api/ai/cv/generate', $document],
            'tts' => ['POST', '/api/ai/tts', ['text' => 'hello']],
        ];
    }

    #[DataProvider('premiumGatedRoutes')]
    public function test_a_free_user_is_refused_on_every_ai_route(string $method, string $uri, array $payload): void
    {
        Sanctum::actingAs(User::factory()->create());

        $gemini = FakeGeminiService::swap();

        $this->json($method, $uri, $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }
}
