<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Models\FeatureUsage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\Practice\SystemDesignRubric;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * System design practice: a scenario answered in fixed sections and scored
 * against a fixed rubric. Code applies the word gates before the model is
 * asked, the model rates only the traits that passed, and code adds it up.
 * The key points stay on the server until the answer is in.
 */
class PracticeSystemDesignTest extends TestCase
{
    use RefreshDatabase;

    private const LONG = 'We need to create short links and redirect them quickly, with p99 under 50 ms and five nines for redirects.';

    private function premium(): User
    {
        $user = User::factory()->premium()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    private function scenario(array $attributes = []): PracticeQuestion
    {
        return PracticeQuestion::factory()->systemDesign()->create($attributes);
    }

    /** Every section well over the gate. */
    private function fullAnswer(array $overrides = []): array
    {
        return array_merge([
            'requirements' => self::LONG,
            'estimates' => '100 million links a month is about 40 writes a second, and ten reads per write makes 400 redirects a second.',
            'api' => 'POST /links takes a long URL and returns the short one; GET /{code} answers 302 with the Location header set.',
            'data_model' => 'A links table keyed by short code holding the long URL, the owner, the creation time and the expiry time.',
            'high_level' => 'Clients reach a load balancer, then stateless app servers, which read through a Redis cache to a sharded key value store.',
            'deep_dive' => 'Shard the links table by short code. Cache hot redirects in Redis with LRU eviction because a few links get most clicks.',
            'tradeoffs' => 'A 302 keeps every click visible to us at the cost of more traffic than a 301. Replicas take over when a node dies.',
        ], $overrides);
    }

    /** A rating for every trait the model was asked about, as the model shapes it. */
    private function ratings(array $traits, array $overrides = []): array
    {
        return ['traits' => array_map(fn (string $trait) => array_merge([
            'trait' => $trait,
            'score' => 3,
            'evidence' => '',
            'improvement' => "Go deeper on {$trait}.",
            'keyPointsCovered' => [1],
        ], $overrides[$trait] ?? []), $traits)];
    }

    private function allTraits(): array
    {
        return array_keys(SystemDesignRubric::TRAITS);
    }

    public function test_every_route_needs_a_token(): void
    {
        $question = $this->scenario();

        $this->getJson('/api/practice/system-design/next')->assertUnauthorized();
        $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])->assertUnauthorized();
    }

    public function test_next_serves_a_scenario_and_the_rubric_but_never_its_key_points(): void
    {
        $this->premium();
        $question = $this->scenario(['topic' => 'URL shortener', 'difficulty' => 'easy']);
        $gemini = FakeGeminiService::swap();

        $response = $this->getJson('/api/practice/system-design/next')->assertOk();

        $response->assertExactJson([
            'question' => [
                'id' => $question->id,
                'title' => 'URL shortener',
                'difficulty' => 'easy',
                'prompt' => $question->prompt,
            ],
            'rubric' => SystemDesignRubric::present(),
        ]);

        $body = $response->getContent();
        foreach ($question->answer['keyPoints'] as $points) {
            foreach ($points as $point) {
                $this->assertStringNotContainsString($point, $body);
            }
        }
        $this->assertStringNotContainsString('keyPoints', $body);
        $this->assertStringNotContainsString($question->explanation, $body);

        // Reading a scenario makes no model call and costs nothing.
        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_next_serves_only_published_system_design_scenarios(): void
    {
        $this->premium();
        $this->scenario(['status' => 'draft']);
        PracticeQuestion::factory()->create();

        $this->getJson('/api/practice/system-design/next')
            ->assertOk()
            ->assertJsonPath('question', null)
            ->assertJsonPath('rubric.version', 'sd-1');
    }

    public function test_next_filters_by_difficulty(): void
    {
        $this->premium();
        $this->scenario(['difficulty' => 'easy']);
        $hard = $this->scenario(['difficulty' => 'hard']);

        $this->getJson('/api/practice/system-design/next?difficulty=hard')->assertOk()->assertJsonPath('question.id', $hard->id);
        $this->getJson('/api/practice/system-design/next?difficulty=medium')->assertOk()->assertJsonPath('question', null);
        $this->getJson('/api/practice/system-design/next?difficulty=impossible')->assertUnprocessable()->assertJsonValidationErrors('difficulty');
    }

    public function test_next_prefers_an_unanswered_scenario_then_the_least_recently_answered(): void
    {
        $user = $this->premium();
        [$first, $second, $third] = [$this->scenario(), $this->scenario(), $this->scenario()];

        PracticeAttempt::factory()->for($user)->for($first, 'question')->create(['kind' => PracticeKind::SystemDesign, 'created_at' => now()->subDays(3)]);
        PracticeAttempt::factory()->for($user)->for($second, 'question')->create(['kind' => PracticeKind::SystemDesign, 'created_at' => now()->subDay()]);
        // Someone else's attempt does not count as this user's.
        PracticeAttempt::factory()->for($third, 'question')->create(['kind' => PracticeKind::SystemDesign]);

        $this->getJson('/api/practice/system-design/next')->assertJsonPath('question.id', $third->id);

        PracticeAttempt::factory()->for($user)->for($third, 'question')->create(['kind' => PracticeKind::SystemDesign, 'created_at' => now()]);

        $this->getJson('/api/practice/system-design/next')->assertJsonPath('question.id', $first->id);
    }

    public function test_next_skips_the_scenario_on_screen_when_there_is_another(): void
    {
        $this->premium();
        $only = $this->scenario();

        $this->getJson("/api/practice/system-design/next?skip={$only->id}")->assertJsonPath('question.id', $only->id);

        $other = $this->scenario();
        $this->getJson("/api/practice/system-design/next?skip={$only->id}")->assertJsonPath('question.id', $other->id);
        $this->getJson("/api/practice/system-design/next?skip={$other->id}")->assertJsonPath('question.id', $only->id);
    }

    public function test_a_free_user_is_refused_and_no_model_is_asked(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $question = $this->scenario();
        $gemini = FakeGeminiService::swap();

        $this->getJson('/api/practice/system-design/next')
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required')
            ->assertJsonPath('feature', 'system_design');

        $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_an_answer_is_scored_against_the_rubric_and_stored(): void
    {
        $user = $this->premium();
        $question = $this->scenario();
        $gemini = FakeGeminiService::swap()->queueJson($this->ratings($this->allTraits(), [
            'requirements' => ['score' => 4, 'evidence' => 'p99 under 50 ms', 'keyPointsCovered' => [1, 2]],
            'estimation' => ['score' => 2],
            'api_data_model' => ['score' => 3],
            'architecture' => ['score' => 3],
            'scalability' => ['score' => 4, 'evidence' => 'Shard the links table by short code.', 'keyPointsCovered' => [1, 2]],
            'reliability' => ['score' => 1, 'keyPointsCovered' => []],
            'communication' => ['score' => 2],
        ]));

        $response = $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
            ->assertOk();

        // 12 + 6 + 12 + 15 + 16 + 4 + 4
        $response->assertJsonPath('score', 69)
            ->assertJsonPath('maxScore', 100)
            ->assertJsonPath('rubricVersion', 'sd-1')
            ->assertJsonPath('questionId', $question->id)
            ->assertJsonPath('explanation', $question->explanation)
            ->assertJsonPath('traits.0.key', 'requirements')
            ->assertJsonPath('traits.0.label', 'Requirements and scope')
            ->assertJsonPath('traits.0.score', 4)
            ->assertJsonPath('traits.0.max', 4)
            ->assertJsonPath('traits.0.points', 12)
            ->assertJsonPath('traits.0.descriptor', SystemDesignRubric::TRAITS['requirements']['descriptors'][4])
            ->assertJsonPath('traits.0.evidence', 'p99 under 50 ms')
            ->assertJsonPath('traits.0.improvement', 'Go deeper on requirements.')
            ->assertJsonPath('traits.0.keyPoints.covered', $question->answer['keyPoints']['requirements'])
            ->assertJsonPath('traits.0.keyPoints.missed', [])
            ->assertJsonPath('traits.5.keyPoints.covered', [])
            ->assertJsonPath('traits.5.keyPoints.missed', $question->answer['keyPoints']['reliability']);

        // The prompt names the scenario, the answer, every trait's descriptors
        // and its key points.
        $gemini->assertCallCount('generateJson', 1)
            ->assertPromptContains($question->prompt)
            ->assertPromptContains(self::LONG)
            ->assertPromptContains(SystemDesignRubric::TRAITS['scalability']['descriptors'][3])
            ->assertPromptContains('1. '.$question->answer['keyPoints']['scalability'][0]);

        $attempt = PracticeAttempt::sole();
        $this->assertSame($user->id, $attempt->user_id);
        $this->assertSame($question->id, $attempt->practice_question_id);
        $this->assertSame(PracticeKind::SystemDesign, $attempt->kind);
        $this->assertSame(69, $attempt->score);
        $this->assertSame(100, $attempt->max_score);
        $this->assertNull($attempt->correct);
        $this->assertSame('sd-1', $attempt->rubric_version);
        $this->assertSame($this->fullAnswer(), $attempt->response['sections']);
        $this->assertSame($response->json('traits'), $attempt->feedback['traits']);
        $response->assertJsonPath('attemptId', $attempt->id);

        // One use of the plan's allowance.
        $this->assertSame(1, FeatureUsage::query()->where('feature', 'system_design')->count());
    }

    public function test_a_trait_whose_section_is_empty_scores_zero_and_is_not_asked_about(): void
    {
        $this->premium();
        $question = $this->scenario();
        $judged = array_values(array_diff($this->allTraits(), ['estimation']));
        $gemini = FakeGeminiService::swap()->queueJson($this->ratings([...$judged, 'estimation'], [
            // Asked or not, a rating for a gated trait is ignored.
            'estimation' => ['score' => 4],
        ]));

        $response = $this->postJson("/api/practice/system-design/{$question->id}/answers", [
            'sections' => $this->fullAnswer(['estimates' => '']),
        ])->assertOk();

        $estimation = collect($response->json('traits'))->firstWhere('key', 'estimation');
        $this->assertSame(0, $estimation['score']);
        $this->assertTrue($estimation['gated']);
        $this->assertSame(0, $estimation['words']);
        $this->assertSame($question->answer['keyPoints']['estimation'], $estimation['keyPoints']['missed']);

        $call = $gemini->lastCall('generateJson');
        $this->assertStringNotContainsString('(trait: estimation)', $call['prompt']);
        foreach (SystemDesignRubric::TRAITS['estimation']['descriptors'] as $descriptor) {
            $this->assertStringNotContainsString($descriptor, $call['prompt']);
        }
        foreach ($question->answer['keyPoints']['estimation'] as $point) {
            $this->assertStringNotContainsString($point, $call['prompt']);
        }
        $this->assertSame($judged, $call['responseSchema']['properties']['traits']['items']['properties']['trait']['enum']);
        $gemini->assertPromptContains('(trait: scalability)');

        // Every other trait at 3: 100 less the estimation's 12, times 3/4.
        $response->assertJsonPath('score', 66);
    }

    public function test_a_section_under_fifteen_words_is_gated_like_an_empty_one(): void
    {
        $this->premium();
        $question = $this->scenario();
        $gemini = FakeGeminiService::swap()->queueJson($this->ratings(array_values(array_diff($this->allTraits(), ['architecture']))));

        $response = $this->postJson("/api/practice/system-design/{$question->id}/answers", [
            'sections' => $this->fullAnswer(['high_level' => 'Load balancer, app servers, cache, database.']),
        ])->assertOk();

        $architecture = collect($response->json('traits'))->firstWhere('key', 'architecture');
        $this->assertSame(0, $architecture['score']);
        $this->assertSame(6, $architecture['words']);
        $this->assertStringNotContainsString('(trait: architecture)', $gemini->lastCall('generateJson')['prompt']);
    }

    public function test_scores_are_clamped_and_a_quote_not_in_the_answer_is_dropped(): void
    {
        $this->premium();
        $question = $this->scenario();
        FakeGeminiService::swap()->queueJson($this->ratings($this->allTraits(), [
            'requirements' => ['score' => 11, 'evidence' => 'We will use Kubernetes everywhere.'],
            'scalability' => ['score' => -4, 'evidence' => 'cache hot redirects in redis'],
            'reliability' => ['keyPointsCovered' => [7, 0, 2]],
        ]));

        $response = $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
            ->assertOk();

        $traits = collect($response->json('traits'))->keyBy('key');
        $this->assertSame(4, $traits['requirements']['score']);
        $this->assertNull($traits['requirements']['evidence']);
        $this->assertSame(0, $traits['scalability']['score']);
        $this->assertSame('cache hot redirects in redis', $traits['scalability']['evidence']);
        $this->assertSame([$question->answer['keyPoints']['reliability'][1]], $traits['reliability']['keyPoints']['covered']);
    }

    public function test_a_judgement_missing_a_trait_is_a_failed_call_and_costs_nothing(): void
    {
        $this->premium();
        $question = $this->scenario();
        FakeGeminiService::swap()->queueJson($this->ratings(['requirements', 'estimation']));

        $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        $this->assertSame(0, PracticeAttempt::count());
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_a_gemini_failure_is_a_502_with_no_leak_and_no_use_counted(): void
    {
        $this->premium();
        $question = $this->scenario();
        FakeGeminiService::swap()->throwOn('generateJson');

        $response = $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
            ->assertStatus(502)
            ->assertExactJson([
                'message' => 'The AI service is unavailable right now. Please try again in a moment.',
                'code' => 'ai_unavailable',
            ]);

        $this->assertStringNotContainsString('upstream', $response->getContent());
        $this->assertSame(0, PracticeAttempt::count());
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_an_answer_under_fifteen_words_is_refused_before_the_model(): void
    {
        $this->premium();
        $question = $this->scenario();
        $gemini = FakeGeminiService::swap();

        $this->postJson("/api/practice/system-design/{$question->id}/answers", [
            'sections' => ['requirements' => 'Short links.', 'estimates' => '40 writes a second.'],
        ])->assertUnprocessable()->assertJsonValidationErrors('sections');

        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_the_sections_are_validated(): void
    {
        $this->premium();
        $question = $this->scenario();
        $gemini = FakeGeminiService::swap();
        $url = "/api/practice/system-design/{$question->id}/answers";

        $this->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('sections');
        $this->postJson($url, ['sections' => $this->fullAnswer(['summary' => 'An extra section.'])])
            ->assertUnprocessable()->assertJsonValidationErrors('sections');
        $this->postJson($url, ['sections' => $this->fullAnswer(['api' => ['POST /links']])])
            ->assertUnprocessable()->assertJsonValidationErrors('sections.api');
        $this->postJson($url, ['sections' => $this->fullAnswer(['deep_dive' => str_repeat('a ', 4000)])])
            ->assertUnprocessable()->assertJsonValidationErrors('sections.deep_dive');

        $gemini->assertNothingSent();
    }

    public function test_missing_sections_count_as_empty(): void
    {
        $this->premium();
        $question = $this->scenario();
        FakeGeminiService::swap()->queueJson($this->ratings(['requirements', 'communication']));

        $this->postJson("/api/practice/system-design/{$question->id}/answers", [
            'sections' => ['requirements' => self::LONG, 'api' => null],
        ])->assertOk()->assertJsonPath('traits.1.gated', true);

        $this->assertSame('', PracticeAttempt::sole()->response['sections']['estimates']);
    }

    public function test_a_draft_or_another_kinds_question_is_a_bare_404(): void
    {
        $this->premium();
        $gemini = FakeGeminiService::swap();

        foreach ([$this->scenario(['status' => 'draft']), PracticeQuestion::factory()->create()] as $question) {
            $this->postJson("/api/practice/system-design/{$question->id}/answers", ['sections' => $this->fullAnswer()])
                ->assertNotFound();
        }
        $this->postJson('/api/practice/system-design/999999/answers', ['sections' => $this->fullAnswer()])->assertNotFound();

        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::count());
    }
}
