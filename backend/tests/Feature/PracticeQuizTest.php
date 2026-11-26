<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\AiUsage;
use App\Models\FeatureUsage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The language quiz: multiple choice from a reviewed bank, served in rounds
 * and scored on the server in code. The answer key never leaves the server
 * until the question has been answered, nothing is metered against a plan,
 * and no model is ever called.
 */
class PracticeQuizTest extends TestCase
{
    use RefreshDatabase;

    /** @return Collection<int, PracticeQuestion> */
    private function questions(int $count, array $attributes = []): Collection
    {
        return PracticeQuestion::factory()->count($count)->create($attributes);
    }

    private function attempt(User $user, PracticeQuestion $question, bool $correct, string $at): PracticeAttempt
    {
        return PracticeAttempt::factory()
            ->for($user)
            ->for($question, 'question')
            ->state(['correct' => $correct, 'score' => $correct ? 1 : 0, 'created_at' => $at])
            ->create();
    }

    /** @return list<int> */
    private function roundIds(array $body): array
    {
        $response = $this->postJson('/api/practice/quiz/rounds', $body)->assertOk();

        return array_column($response->json('questions'), 'id');
    }

    public function test_every_route_needs_a_token(): void
    {
        $this->getJson('/api/practice/quiz/catalog')->assertUnauthorized();
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'mixed'])->assertUnauthorized();
        $this->postJson('/api/practice/quiz/answers', ['questionId' => 1, 'choice' => 'x'])->assertUnauthorized();
        $this->getJson('/api/practice/quiz/progress?language=javascript')->assertUnauthorized();
    }

    public function test_the_catalog_counts_published_questions_per_language_and_topic(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->questions(2, ['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);
        $this->questions(1, ['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        PracticeQuestion::factory()->draft()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);
        $this->questions(1, ['language' => PracticeLanguage::Python, 'topic' => 'types']);

        $response = $this->getJson('/api/practice/quiz/catalog')->assertOk();

        // Every launch language is listed, in enum order, even with nothing published.
        $this->assertSame(PracticeLanguage::values(), array_column($response->json('languages'), 'key'));
        $response->assertJsonPath('languages.0.label', 'JavaScript');
        $response->assertJsonPath('languages.0.questionCount', 3);
        $response->assertJsonPath('languages.1.questionCount', 1);
        $response->assertJsonPath('languages.2.questionCount', 0);

        $topics = collect($response->json('languages.0.topics'))->keyBy('key');
        $this->assertSame(array_keys(PracticeLanguage::JavaScript->topics()), $topics->keys()->all());
        $this->assertSame(2, $topics['scope']['questionCount']);
        $this->assertSame(1, $topics['async']['questionCount']);
        $this->assertSame(0, $topics['types']['questionCount']);
        $this->assertSame(PracticeLanguage::JavaScript->topics()['scope'], $topics['scope']['label']);
    }

    public function test_a_round_never_contains_the_answer_or_the_explanation(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $questions = $this->questions(12, ['language' => PracticeLanguage::JavaScript]);

        $response = $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'mixed'])
            ->assertOk()
            ->assertJsonPath('language', 'javascript')
            ->assertJsonPath('topic', 'mixed')
            ->assertJsonCount(10, 'questions');

        foreach ($response->json('questions') as $served) {
            $this->assertSame(['id', 'topic', 'difficulty', 'prompt', 'code', 'options'], array_keys($served));

            $stored = $questions->firstWhere('id', $served['id']);
            $this->assertEqualsCanonicalizing($stored->options, $served['options']);
        }

        $raw = $response->getContent();
        foreach ($questions as $question) {
            $this->assertStringNotContainsString($question->explanation, $raw);
        }
        $this->assertStringNotContainsString('"answer"', $raw);
        $this->assertStringNotContainsString('"explanation"', $raw);
    }

    public function test_a_topic_round_draws_from_that_language_and_topic_only(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $scope = $this->questions(4, ['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);
        $this->questions(4, ['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        $this->questions(4, ['language' => PracticeLanguage::Python, 'topic' => 'types']);

        $ids = $this->roundIds(['language' => 'javascript', 'topic' => 'scope']);

        $this->assertEqualsCanonicalizing($scope->modelKeys(), $ids);
    }

    public function test_drafts_are_never_served(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $published = $this->questions(3, ['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);
        $drafts = PracticeQuestion::factory()->draft()->count(3)
            ->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);

        // A mistake on a question that has since gone back to draft stays off the table too.
        $this->attempt($user, $drafts[0], false, '2026-11-01 10:00:00');

        $this->assertEqualsCanonicalizing($published->modelKeys(), $this->roundIds(['language' => 'javascript', 'topic' => 'scope']));
        $this->assertEqualsCanonicalizing($published->modelKeys(), $this->roundIds(['language' => 'javascript', 'topic' => 'mixed']));
        $this->assertSame([], $this->roundIds(['language' => 'javascript', 'topic' => 'mistakes']));
    }

    public function test_up_to_three_open_mistakes_come_back_then_the_least_recently_answered(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $pool = $this->questions(20, ['language' => PracticeLanguage::JavaScript]);

        // Five open mistakes: their latest attempt was wrong.
        $open = $pool->slice(0, 5);
        foreach ($open->values() as $i => $question) {
            $day = $i + 1;
            $this->attempt($user, $question, true, "2026-11-0{$day} 09:00:00");
            $this->attempt($user, $question, false, "2026-11-2{$day} 09:00:00");
        }

        // Wrong once, then right: no longer a mistake.
        $corrected = $pool[5];
        $this->attempt($user, $corrected, false, '2026-11-01 08:00:00');
        $this->attempt($user, $corrected, true, '2026-11-25 08:00:00');

        // Ten answered correctly, a day apart and before the corrected one;
        // the oldest are due first.
        $answered = $pool->slice(6, 10)->values();
        foreach ($answered as $i => $question) {
            $day = 10 + $i;
            $this->attempt($user, $question, true, "2026-10-{$day} 09:00:00");
        }

        // Someone else's mistakes are not this user's.
        $fresh = $pool->slice(16, 4);
        $stranger = User::factory()->create();
        foreach ($fresh as $question) {
            $this->attempt($stranger, $question, false, '2026-11-25 10:00:00');
        }

        $ids = $this->roundIds(['language' => 'javascript', 'topic' => 'mixed']);

        $this->assertCount(10, $ids);
        $this->assertCount(3, array_intersect($ids, $open->modelKeys()));
        // Then the four never answered, then the three least recently answered.
        foreach ($fresh as $question) {
            $this->assertContains($question->id, $ids);
        }
        $this->assertEqualsCanonicalizing(
            $answered->take(3)->modelKeys(),
            array_values(array_intersect($ids, [...$answered->modelKeys(), $corrected->id])),
        );
    }

    public function test_a_mistakes_round_is_only_open_mistakes_in_that_language(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $open = $this->questions(12, ['language' => PracticeLanguage::JavaScript]);
        foreach ($open as $question) {
            $this->attempt($user, $question, false, '2026-11-20 09:00:00');
        }
        $corrected = PracticeQuestion::factory()->create(['language' => PracticeLanguage::JavaScript]);
        $this->attempt($user, $corrected, false, '2026-11-20 09:00:00');
        $this->attempt($user, $corrected, true, '2026-11-21 09:00:00');
        $python = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python]);
        $this->attempt($user, $python, false, '2026-11-20 09:00:00');
        $this->questions(5, ['language' => PracticeLanguage::JavaScript]);

        $ids = $this->roundIds(['language' => 'javascript', 'topic' => 'mistakes']);

        $this->assertCount(10, $ids);
        $this->assertSame([], array_diff($ids, $open->modelKeys()));
    }

    public function test_an_answer_is_scored_and_recorded(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $question = PracticeQuestion::factory()
            ->withOptions(['0', '1', 'undefined', 'ReferenceError'], 'undefined')
            ->create(['explanation' => 'var is hoisted and starts as undefined.']);

        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => 'undefined'])
            ->assertOk()
            ->assertExactJson([
                'correct' => true,
                'answer' => 'undefined',
                'explanation' => 'var is hoisted and starts as undefined.',
            ]);

        $attempt = PracticeAttempt::sole();
        $this->assertSame($user->id, $attempt->user_id);
        $this->assertSame($question->id, $attempt->practice_question_id);
        $this->assertSame(PracticeKind::Quiz, $attempt->kind);
        $this->assertSame(['choice' => 'undefined'], $attempt->response);
        $this->assertSame(1, $attempt->score);
        $this->assertSame(1, $attempt->max_score);
        $this->assertTrue($attempt->correct);
        $this->assertNull($attempt->feedback);
        $this->assertNull($attempt->rubric_version);

        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => 'ReferenceError'])
            ->assertOk()
            ->assertJsonPath('correct', false)
            ->assertJsonPath('answer', 'undefined');

        $wrong = PracticeAttempt::query()->latest('id')->first();
        $this->assertFalse($wrong->correct);
        $this->assertSame(0, $wrong->score);
    }

    public function test_a_null_choice_is_time_running_out_and_counts_as_wrong(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $question = PracticeQuestion::factory()->create();

        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => null])
            ->assertOk()
            ->assertJsonPath('correct', false)
            ->assertJsonPath('answer', $question->answer['choice']);

        $attempt = PracticeAttempt::sole();
        $this->assertSame(['choice' => null], $attempt->response);
        $this->assertFalse($attempt->correct);
        $this->assertSame(0, $attempt->score);
    }

    public function test_an_unknown_draft_or_other_kind_of_question_is_not_found(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $draft = PracticeQuestion::factory()->draft()->create();
        $review = PracticeQuestion::factory()->create(['kind' => PracticeKind::CodeReview]);

        $bodies = [];
        foreach ([999_999, $draft->id, $review->id] as $id) {
            $bodies[] = $this->postJson('/api/practice/quiz/answers', ['questionId' => $id, 'choice' => 'anything'])
                ->assertNotFound()
                ->assertJsonMissingPath('answer')
                ->assertJsonMissingPath('explanation')
                ->json();
        }

        // Nothing tells a draft apart from an id that was never there.
        $this->assertCount(1, array_unique(array_map('json_encode', $bodies)));

        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_bad_input_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $question = PracticeQuestion::factory()->withOptions(['a', 'b', 'c', 'd'], 'b')->create();

        $this->postJson('/api/practice/quiz/rounds', ['topic' => 'mixed'])
            ->assertUnprocessable()->assertJsonValidationErrors('language');
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'cobol', 'topic' => 'mixed'])
            ->assertUnprocessable()->assertJsonValidationErrors('language');
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript'])
            ->assertUnprocessable()->assertJsonValidationErrors('topic');
        // A topic of another language is not this language's topic.
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'joins'])
            ->assertUnprocessable()->assertJsonValidationErrors('topic');

        $this->postJson('/api/practice/quiz/answers', ['choice' => 'b'])
            ->assertUnprocessable()->assertJsonValidationErrors('questionId');
        // null is the timer running out; leaving the field off is a broken client.
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id])
            ->assertUnprocessable()->assertJsonValidationErrors('choice');
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => ['b']])
            ->assertUnprocessable()->assertJsonValidationErrors('choice');
        // Something that is not one of the options is refused, not marked wrong.
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => 'e'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('choice')
            ->assertJsonMissingPath('answer');

        $this->getJson('/api/practice/quiz/progress')
            ->assertUnprocessable()->assertJsonValidationErrors('language');

        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_progress_is_accuracy_per_topic_and_open_mistakes(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        [$scopeA, $scopeB] = $this->questions(2, ['language' => PracticeLanguage::JavaScript, 'topic' => 'scope'])->all();
        $async = PracticeQuestion::factory()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        $draft = PracticeQuestion::factory()->draft()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        $python = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python, 'topic' => 'types']);

        $this->attempt($user, $scopeA, false, '2026-11-20 09:00:00');
        $this->attempt($user, $scopeA, true, '2026-11-21 09:00:00');
        $this->attempt($user, $scopeB, true, '2026-11-20 09:00:00');
        $this->attempt($user, $scopeB, false, '2026-11-22 09:00:00');
        $this->attempt($user, $async, false, '2026-11-20 09:00:00');
        $this->attempt($user, $draft, false, '2026-11-20 09:00:00');
        $this->attempt($user, $python, false, '2026-11-20 09:00:00');
        $this->attempt(User::factory()->create(), $async, true, '2026-11-20 09:00:00');

        $response = $this->getJson('/api/practice/quiz/progress?language=javascript')
            ->assertOk()
            ->assertJsonPath('language', 'javascript')
            ->assertJsonPath('answered', 5)
            ->assertJsonPath('correct', 2)
            ->assertJsonPath('accuracy', 40)
            ->assertJsonPath('openMistakes', 2);

        $topics = collect($response->json('topics'))->keyBy('key');
        $this->assertSame(array_keys(PracticeLanguage::JavaScript->topics()), $topics->keys()->all());
        $this->assertSame(['answered' => 4, 'correct' => 2, 'accuracy' => 50, 'openMistakes' => 1], array_intersect_key(
            $topics['scope'],
            array_flip(['answered', 'correct', 'accuracy', 'openMistakes']),
        ));
        $this->assertSame(1, $topics['async']['answered']);
        $this->assertSame(0, $topics['async']['accuracy']);
        $this->assertSame(1, $topics['async']['openMistakes']);
        $this->assertSame(0, $topics['types']['answered']);
        $this->assertNull($topics['types']['accuracy']);
    }

    public function test_nothing_is_metered_and_no_model_is_called(): void
    {
        $gemini = FakeGeminiService::swap();
        // A free account: the quiz is on every plan.
        Sanctum::actingAs(User::factory()->create());
        $question = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Sql, 'topic' => 'joins']);

        $this->getJson('/api/practice/quiz/catalog')->assertOk();
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'sql', 'topic' => 'joins'])->assertOk();
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => $question->options[1]])->assertOk();
        $this->getJson('/api/practice/quiz/progress?language=sql')->assertOk();

        $this->assertSame(0, FeatureUsage::count());
        $this->assertSame(0, AiUsage::count());
        $gemini->assertNothingSent();
    }
}
