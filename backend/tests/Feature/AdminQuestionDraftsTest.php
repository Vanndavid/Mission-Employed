<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\FeatureUsage;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use App\Services\Practice\DraftKind;
use App\Services\Practice\DraftKinds;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * AI drafts for the practice bank. The model writes questions; code checks
 * every one before it is saved; what passes is a draft no user can see until
 * an admin publishes it, and what fails comes back with its reasons.
 */
class AdminQuestionDraftsTest extends TestCase
{
    use RefreshDatabase;

    private const REQUEST = [
        'kind' => 'quiz',
        'language' => 'javascript',
        'topic' => 'scope',
        'difficulty' => 'medium',
        'count' => 5,
    ];

    /** One model item, well formed for the request above unless overridden. */
    private function item(array $overrides = []): array
    {
        return [
            'language' => 'javascript',
            'topic' => 'scope',
            'prompt' => 'What does this print?',
            'code' => "console.log(x);\nvar x = 5;",
            'options' => ['5', 'undefined', 'ReferenceError', 'null'],
            'answer' => 'undefined',
            'explanation' => 'var is hoisted and starts as undefined.',
            'distractorNotes' => [
                ['option' => '5', 'why' => 'The assignment runs after the log.'],
                ['option' => 'ReferenceError', 'why' => 'That is let in its temporal dead zone.'],
                ['option' => 'null', 'why' => 'Nothing here sets null.'],
            ],
            ...$overrides,
        ];
    }

    private function generate(array $items, array $request = []): TestResponse
    {
        FakeGeminiService::swap()->queueJson(['questions' => $items]);

        return $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, ...$request]);
    }

    public function test_only_an_admin_can_generate(): void
    {
        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->postJson('/api/admin/practice/questions/generate', self::REQUEST)
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_required');

        $gemini->assertNothingSent();
        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_it_needs_a_token(): void
    {
        $this->postJson('/api/admin/practice/questions/generate', self::REQUEST)->assertUnauthorized();
    }

    public function test_only_the_valid_items_become_drafts_and_the_broken_ones_come_back_with_reasons(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $tooLong = implode("\n", array_map(fn (int $i) => "f({$i});", range(1, 41)));

        $response = $this->generate([
            $this->item(),
            $this->item(['prompt' => 'What is typeof null?', 'code' => '', 'options' => ['null', 'object', 'undefined', 'number'], 'answer' => 'object', 'distractorNotes' => []]),
            $this->item(['prompt' => 'Key not in options', 'answer' => 'NaN']),
            $this->item(['prompt' => 'Three options', 'options' => ['5', 'undefined', 'null'], 'answer' => '5']),
            $this->item(['prompt' => 'Long snippet', 'code' => $tooLong]),
        ])->assertOk();

        $response->assertJsonCount(2, 'drafts');
        $response->assertJsonPath('drafts.0.prompt', 'What does this print?');
        $response->assertJsonPath('drafts.0.status', 'draft');
        $response->assertJsonPath('drafts.0.source', 'ai');
        $response->assertJsonPath('drafts.0.answer', ['choice' => 'undefined']);
        $response->assertJsonPath('drafts.1.code', null);

        $rejected = $response->json('rejected');
        $this->assertSame([3, 4, 5], array_column($rejected, 'index'));
        $this->assertSame('Key not in options', $rejected[0]['prompt']);
        $this->assertStringContainsString('one of the options', implode(' ', $rejected[0]['reasons']));
        $this->assertStringContainsString('exactly four', implode(' ', $rejected[1]['reasons']));
        $this->assertStringContainsString('40 lines', implode(' ', $rejected[2]['reasons']));

        $drafts = PracticeQuestion::all();
        $this->assertCount(2, $drafts);
        foreach ($drafts as $draft) {
            $this->assertSame(PracticeKind::Quiz, $draft->kind);
            $this->assertSame(PracticeLanguage::JavaScript, $draft->language);
            $this->assertSame('scope', $draft->topic);
            // The difficulty is the request's; the model is not asked for it.
            $this->assertSame('medium', $draft->difficulty);
            $this->assertSame(PracticeQuestionStatus::Draft, $draft->status);
            $this->assertSame(PracticeQuestionSource::Ai, $draft->source);
            $this->assertNull($draft->external_id);
        }
    }

    public function test_a_draft_that_drifted_from_the_language_or_topic_asked_for_is_dropped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->generate([
            $this->item(['prompt' => 'A Python question', 'language' => 'python', 'topic' => 'types']),
            $this->item(['prompt' => 'Another topic', 'topic' => 'async']),
            $this->item(['prompt' => 'Repeated options', 'options' => ['5', 'undefined', 'Undefined', 'null']]),
            $this->item(['prompt' => 'No explanation', 'explanation' => '']),
        ], ['count' => 4])->assertOk();

        $response->assertJsonCount(0, 'drafts');
        $reasons = collect($response->json('rejected'))->pluck('reasons', 'prompt');
        $this->assertStringContainsString('javascript', implode(' ', $reasons['A Python question']));
        $this->assertStringContainsString('scope', implode(' ', $reasons['Another topic']));
        $this->assertStringContainsString('different', implode(' ', $reasons['Repeated options']));
        $this->assertStringContainsString('explanation', implode(' ', $reasons['No explanation']));
        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_items_beyond_the_count_asked_for_are_not_saved(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->generate([
            $this->item(['prompt' => 'First']),
            $this->item(['prompt' => 'Second']),
        ], ['count' => 1])->assertOk();

        $response->assertJsonCount(1, 'drafts');
        $response->assertJsonPath('rejected.0.prompt', 'Second');
        $this->assertSame(1, PracticeQuestion::count());
    }

    public function test_a_draft_repeating_a_question_already_in_the_bank_or_the_batch_is_dropped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $existing = PracticeQuestion::factory()->create([
            'prompt' => 'What does this print?',
            'code' => "console.log(x);\nvar x = 5;",
        ]);

        $response = $this->generate([
            $this->item(),
            $this->item(['prompt' => 'Fresh one', 'code' => 'console.log(typeof y);']),
            $this->item(['prompt' => 'Fresh one', 'code' => 'console.log(typeof y);']),
        ], ['count' => 3])->assertOk();

        $response->assertJsonCount(1, 'drafts');
        $reasons = $response->json('rejected');
        $this->assertStringContainsString("#{$existing->id}", implode(' ', $reasons[0]['reasons']));
        $this->assertStringContainsString('item 2', implode(' ', $reasons[1]['reasons']));
    }

    public function test_the_review_notes_are_kept_for_admins_and_never_reach_a_user(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->generate([$this->item()], ['count' => 1])
            ->assertOk()
            ->assertJsonPath('drafts.0.reviewNotes.distractors.0', ['option' => '5', 'why' => 'The assignment runs after the log.'])
            ->assertJsonCount(3, 'drafts.0.reviewNotes.distractors');

        $draft = PracticeQuestion::sole();
        $this->assertCount(3, $draft->review_notes['distractors']);
        // A safety net like the key's: never in a question's serialization.
        $this->assertArrayNotHasKey('review_notes', $draft->toArray());
        $this->assertArrayNotHasKey('answer', $draft->toArray());
    }

    public function test_a_draft_is_never_served_by_the_quiz_routes(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->generate([$this->item()], ['count' => 1])->assertOk();
        $draft = PracticeQuestion::sole();

        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'scope'])
            ->assertOk()
            ->assertJsonCount(0, 'questions');
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'mixed'])
            ->assertJsonCount(0, 'questions');
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $draft->id, 'choice' => 'undefined'])
            ->assertNotFound();
        $this->getJson('/api/practice/quiz/catalog')->assertJsonPath('languages.0.questionCount', 0);
    }

    public function test_it_asks_once_with_a_schema_naming_the_language_topic_and_what_is_already_in_the_bank(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        PracticeQuestion::factory()->create(['prompt' => 'Which closure captures i?', 'topic' => 'scope']);
        PracticeQuestion::factory()->create(['prompt' => 'Unrelated python question', 'language' => PracticeLanguage::Python, 'topic' => 'types']);

        $gemini = FakeGeminiService::swap()->queueJson(['questions' => [$this->item()]]);
        $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, 'count' => 2])->assertOk();

        $gemini->assertCallCount('generateJson', 1);
        $call = $gemini->lastCall('generateJson');
        $this->assertStringContainsString('JavaScript', $call['prompt']);
        $this->assertStringContainsString('Scope, hoisting & closures', $call['prompt']);
        $this->assertStringContainsString('medium', $call['prompt']);
        $this->assertStringContainsString('Which closure captures i?', $call['prompt']);
        $this->assertStringNotContainsString('Unrelated python question', $call['prompt']);
        $this->assertSame('ARRAY', $call['responseSchema']['properties']['questions']['type']);
        $this->assertArrayHasKey('distractorNotes', $call['responseSchema']['properties']['questions']['items']['properties']);
    }

    public function test_an_answer_with_no_questions_in_it_saves_nothing(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        FakeGeminiService::swap()->queueJson(['questions' => 'none'], ['nope' => true]);

        $this->postJson('/api/admin/practice/questions/generate', self::REQUEST)
            ->assertOk()
            ->assertExactJson(['drafts' => [], 'rejected' => []]);
        $this->postJson('/api/admin/practice/questions/generate', self::REQUEST)
            ->assertOk()
            ->assertExactJson(['drafts' => [], 'rejected' => []]);

        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_when_gemini_fails_it_is_a_502_and_nothing_is_saved(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        FakeGeminiService::swap()->throwOn(
            'generateJson',
            GeminiException::fromStatus(500, 'gemini-secret-model', '{"error":"upstream quota detail"}'),
        );

        $response = $this->postJson('/api/admin/practice/questions/generate', self::REQUEST)
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        $this->assertStringNotContainsString('upstream', $response->getContent());
        $this->assertStringNotContainsString('gemini-secret-model', $response->getContent());
        $this->assertSame(0, PracticeQuestion::count());
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badRequests(): array
    {
        return [
            'no kind' => [['kind' => null], 'kind'],
            'an unknown kind' => [['kind' => 'essay'], 'kind'],
            'no language' => [['language' => null], 'language'],
            'a topic from another language' => [['topic' => 'joins'], 'topic'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
            'too many' => [['count' => 6], 'count'],
            'none' => [['count' => 0], 'count'],
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

    public function test_a_kind_with_no_generator_yet_is_refused_with_a_clear_message(): void
    {
        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->admin()->create());
        // Every kind has one now; a kind added later starts without.
        $this->app->instance(DraftKinds::class, new class extends DraftKinds
        {
            public function for(PracticeKind $kind): ?DraftKind
            {
                return $kind === PracticeKind::SystemDesign ? null : parent::for($kind);
            }
        });

        $response = $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, 'kind' => 'system_design'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('kind');

        $this->assertStringContainsString('system design', $response->json('errors.kind.0'));
        $gemini->assertNothingSent();
    }

    public function test_generating_is_an_admin_tool_and_counts_against_no_plan(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->generate([$this->item()], ['count' => 1])->assertOk();

        $this->assertSame(0, FeatureUsage::count());
    }
}
