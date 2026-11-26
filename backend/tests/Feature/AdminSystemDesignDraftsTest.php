<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\Practice\SystemDesignItemValidator;
use App\Services\Practice\SystemDesignRubric;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * AI drafts of system design scenarios for the question bank, and the
 * admin's edits to them. Every draft and every save passes
 * SystemDesignItemValidator, the seed files' rules: every rubric trait with
 * 2 to 6 distinct key points, and a prompt with scale numbers in it.
 */
class AdminSystemDesignDraftsTest extends TestCase
{
    use RefreshDatabase;

    private const REQUEST = ['kind' => 'system_design', 'difficulty' => 'medium', 'count' => 5];

    private const PROMPT = 'Design a rate limiter for a public API with 20,000 customers sending 50,000 requests a second at peak. Each customer has a limit per minute.';

    /** @return array<string, list<string>> */
    private static function keyPoints(array $overrides = []): array
    {
        $points = [];
        foreach (array_keys(SystemDesignRubric::TRAITS) as $trait) {
            $points[$trait] = ["First point on {$trait}", "Second point on {$trait}"];
        }

        return [...$points, ...$overrides];
    }

    /** One model item, well formed unless overridden. */
    private static function item(array $overrides = []): array
    {
        return [
            'title' => 'API rate limiter',
            'prompt' => self::PROMPT,
            'explanation' => 'It tests where the counters live and what happens when that store is slow.',
            'keyPoints' => self::keyPoints(),
            ...$overrides,
        ];
    }

    private function generate(array $items, array $request = []): TestResponse
    {
        FakeGeminiService::swap()->queueJson(['questions' => $items]);

        return $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, ...$request]);
    }

    private static function reasons(TestResponse $response, int $index): string
    {
        $rejected = collect($response->json('rejected'))->firstWhere('index', $index);

        return implode(' ', $rejected['reasons'] ?? ['(not rejected)']);
    }

    public function test_only_the_valid_scenarios_become_drafts_and_the_broken_ones_come_back_with_reasons(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $withoutCommunication = self::keyPoints();
        unset($withoutCommunication['communication']);

        $response = $this->generate([
            self::item(),
            self::item(['prompt' => self::PROMPT.' Missing a trait.', 'keyPoints' => $withoutCommunication]),
            self::item(['prompt' => self::PROMPT.' One key point.', 'keyPoints' => self::keyPoints(['scalability' => ['Shard the counters']])]),
            self::item(['prompt' => 'Design a rate limiter for a public API that many customers call, each with its own limit per minute.']),
            self::item(['prompt' => self::PROMPT.' Repeats.', 'keyPoints' => self::keyPoints(['estimation' => ['50k a second', '50K a second']])]),
        ])->assertOk();

        $response->assertJsonCount(1, 'drafts');
        $response->assertJsonPath('drafts.0.kind', 'system_design');
        $response->assertJsonPath('drafts.0.status', 'draft');
        $response->assertJsonPath('drafts.0.source', 'ai');
        $response->assertJsonPath('drafts.0.topic', 'API rate limiter');
        $response->assertJsonPath('drafts.0.language', null);
        $response->assertJsonPath('drafts.0.code', null);
        $response->assertJsonPath('drafts.0.options', null);

        $this->assertSame([2, 3, 4, 5], array_column($response->json('rejected'), 'index'));
        $this->assertStringContainsString('communication needs at least 2', self::reasons($response, 2));
        $this->assertStringContainsString('scalability needs at least 2', self::reasons($response, 3));
        $this->assertStringContainsString('scale numbers', self::reasons($response, 4));
        $this->assertStringContainsString('repeats a key point', self::reasons($response, 5));

        $draft = PracticeQuestion::sole();
        $this->assertSame(PracticeKind::SystemDesign, $draft->kind);
        $this->assertNull($draft->language);
        // The difficulty is the request's; the model is not asked for it.
        $this->assertSame('medium', $draft->difficulty);
        $this->assertSame(PracticeQuestionStatus::Draft, $draft->status);
        $this->assertSame(PracticeQuestionSource::Ai, $draft->source);
        // The columns the seed files store, key points in rubric order.
        $columns = SystemDesignItemValidator::columns([...self::item(), 'difficulty' => 'medium']);
        $this->assertSame($columns['answer'], $draft->answer);
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_keys($draft->answer['keyPoints']));
        $this->assertSame($columns['explanation'], $draft->explanation);
    }

    public function test_a_trait_the_rubric_does_not_have_or_key_points_that_are_not_a_map_are_dropped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->generate([
            self::item(['keyPoints' => self::keyPoints(['security' => ['Authenticate callers', 'Sign requests']])]),
            self::item(['prompt' => self::PROMPT.' A list.', 'keyPoints' => [['trait' => 'requirements', 'points' => ['a', 'b']]]]),
            self::item(['prompt' => self::PROMPT.' No title.', 'title' => ['API rate limiter']]),
        ], ['count' => 3])->assertOk();

        $response->assertJsonCount(0, 'drafts');
        $this->assertStringContainsString('security is not a rubric trait', self::reasons($response, 1));
        $this->assertStringContainsString('must map each rubric trait', self::reasons($response, 2));
        $this->assertStringContainsString('Needs a title', self::reasons($response, 3));
        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_the_models_types_are_normalised(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->generate([
            self::item([
                'title' => '  API rate limiter ',
                'keyPoints' => [
                    ...self::keyPoints(),
                    'estimation' => ['  About 50,000 checks a second at peak ', 20000, '', '   '],
                ],
            ]),
        ], ['count' => 1])->assertOk()->assertJsonCount(1, 'drafts');

        $draft = PracticeQuestion::sole();
        $this->assertSame('API rate limiter', $draft->topic);
        // Trimmed, a number read as text, and blank points dropped.
        $this->assertSame(['About 50,000 checks a second at peak', '20000'], $draft->answer['keyPoints']['estimation']);
    }

    public function test_it_asks_once_with_the_rubric_and_every_scenario_already_in_the_bank(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        PracticeQuestion::factory()->systemDesign()->create(['prompt' => 'Design a URL shortener for 100 million links a month.', 'difficulty' => 'easy']);
        PracticeQuestion::factory()->codeReview()->create(['prompt' => 'A code review snippet.']);

        $gemini = FakeGeminiService::swap()->queueJson(['questions' => [self::item()]]);
        $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, 'count' => 2])->assertOk();

        $gemini->assertCallCount('generateJson', 1);
        $call = $gemini->lastCall('generateJson');
        $this->assertStringContainsString('medium', $call['prompt']);
        // Every scenario, whatever its difficulty, so a new one is not the same system again.
        $this->assertStringContainsString('Design a URL shortener for 100 million links a month.', $call['prompt']);
        $this->assertStringNotContainsString('A code review snippet.', $call['prompt']);
        foreach (SystemDesignRubric::TRAITS as $key => $trait) {
            $this->assertStringContainsString($key, $call['prompt']);
            $this->assertStringContainsString($trait['label'], $call['prompt']);
        }

        $keyPoints = $call['responseSchema']['properties']['questions']['items']['properties']['keyPoints'];
        $this->assertSame('OBJECT', $keyPoints['type']);
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), $keyPoints['required']);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badRequests(): array
    {
        return [
            'no difficulty' => [['difficulty' => null], 'difficulty'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
            'too many' => [['count' => 6], 'count'],
        ];
    }

    #[DataProvider('badRequests')]
    public function test_the_request_is_checked_before_the_model_is_asked(array $overrides, string $field): void
    {
        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, ...$overrides])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $gemini->assertNothingSent();
    }

    public function test_a_draft_is_never_served_or_scored(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->generate([self::item()], ['count' => 1])->assertOk();
        $draft = PracticeQuestion::sole();

        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/practice/system-design/next')->assertOk()->assertJsonPath('question', null);
        $sections = array_fill_keys(array_keys(SystemDesignRubric::SECTIONS), str_repeat('Counters live in Redis, one key per customer and window. ', 3));
        $this->postJson("/api/practice/system-design/{$draft->id}/answers", ['sections' => $sections])->assertNotFound();
        $gemini->assertNothingSent();
    }

    private function aiDraft(array $attributes = []): PracticeQuestion
    {
        return PracticeQuestion::factory()->systemDesign()->draft()->create(['source' => PracticeQuestionSource::Ai, ...$attributes]);
    }

    public function test_an_admin_edits_a_draft_and_publishes_it_and_users_are_served_it(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();
        $keyPoints = $draft->answer['keyPoints'];
        $keyPoints['scalability'] = ['Shard by short code', 'Cache hot redirects', 'Pre-generate codes in batches'];

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'topic' => 'Link shortener',
            'answer' => ['keyPoints' => $keyPoints],
            'difficulty' => 'hard',
        ])
            ->assertOk()
            ->assertJsonPath('question.topic', 'Link shortener')
            ->assertJsonPath('question.answer.keyPoints.scalability.2', 'Pre-generate codes in batches');

        $this->assertSame('hard', $draft->fresh()->difficulty);

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('question.status', 'published');

        Sanctum::actingAs(User::factory()->premium()->create());
        $this->getJson('/api/practice/system-design/next')->assertJsonPath('question.id', $draft->id);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badEdits(): array
    {
        $keyPoints = fn (array $overrides) => ['keyPoints' => [...self::keyPoints(), ...$overrides]];
        $missing = self::keyPoints();
        unset($missing['reliability']);

        return [
            'a trait with one key point' => [['answer' => $keyPoints(['architecture' => ['Only one']])], 'answer'],
            'a trait missing' => [['answer' => ['keyPoints' => $missing]], 'answer'],
            'a trait the rubric does not have' => [['answer' => $keyPoints(['security' => ['a', 'b']])], 'answer'],
            'seven key points' => [['answer' => $keyPoints(['scalability' => ['a', 'b', 'c', 'd', 'e', 'f', 'g']])], 'answer'],
            'key points that are not a map' => [['answer' => ['keyPoints' => ['a', 'b']]], 'answer'],
            'no title' => [['topic' => ''], 'topic'],
            'a prompt with no numbers' => [['prompt' => str_repeat('Design a system that shortens links for everyone. ', 3)], 'prompt'],
            'a prompt too short' => [['prompt' => 'Design 1 thing.'], 'prompt'],
            'no explanation' => [['explanation' => ''], 'explanation'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
        ];
    }

    /** @param  array<string, mixed>  $edit */
    #[DataProvider('badEdits')]
    public function test_every_save_runs_the_same_checks_as_a_draft(array $edit, string $field): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();
        $before = $draft->fresh()->getAttributes();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", $edit)
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertSame($before, $draft->fresh()->getAttributes());
    }

    public function test_publishing_checks_the_scenario_too(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $broken = $this->aiDraft(['answer' => ['keyPoints' => []]]);

        $this->patchJson("/api/admin/practice/questions/{$broken->id}", ['status' => 'published'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('answer');

        $this->assertSame(PracticeQuestionStatus::Draft, $broken->fresh()->status);
    }

    public function test_an_edit_keeps_only_the_columns_a_scenario_has(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'language' => 'javascript',
            'code' => 'console.log(1);',
            'options' => ['a', 'b', 'c', 'd'],
        ])->assertOk();

        $draft->refresh();
        $this->assertNull($draft->language);
        $this->assertNull($draft->code);
        $this->assertNull($draft->options);
    }
}
