<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\FeatureUsage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\Practice\SystemDesignRubric;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Practice history: GET /api/practice/attempts, the user's attempts in every
 * mode, newest first, and GET /api/practice/attempts/{id}, one of them with
 * what it was scored and told, to draw that mode's result again. Someone
 * else's attempt is a 404. Reading your own history is free on every plan
 * and never calls a model.
 */
class PracticeAttemptHistoryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    private function signIn(?User $user = null): User
    {
        $user ??= $this->user;
        Sanctum::actingAs($user);

        return $user;
    }

    private function quizAttempt(PracticeQuestion $question, ?string $choice, string $at, ?User $user = null): PracticeAttempt
    {
        $correct = $question->isCorrectChoice($choice);

        return PracticeAttempt::factory()
            ->for($user ?? $this->user)
            ->for($question, 'question')
            ->state(['response' => ['choice' => $choice], 'correct' => $correct, 'score' => $correct ? 1 : 0, 'created_at' => $at])
            ->create();
    }

    private function reviewAttempt(PracticeQuestion $snippet, string $at, ?User $user = null): PracticeAttempt
    {
        return PracticeAttempt::factory()
            ->codeReview()
            ->for($user ?? $this->user)
            ->for($snippet, 'question')
            ->state(['score' => 42, 'created_at' => $at])
            ->create();
    }

    private function designAttempt(PracticeQuestion $scenario, string $at, ?User $user = null): PracticeAttempt
    {
        return PracticeAttempt::factory()
            ->for($user ?? $this->user)
            ->for($scenario, 'question')
            ->state([
                'kind' => PracticeKind::SystemDesign,
                'response' => ['sections' => ['requirements' => 'Short links that redirect fast.', 'api' => 'POST /links']],
                'score' => 12,
                'max_score' => 100,
                'correct' => null,
                'feedback' => ['traits' => [[
                    'key' => 'requirements',
                    'label' => 'Requirements and scope',
                    'score' => 4,
                    'max' => 4,
                    'points' => 12,
                    'maxPoints' => 12,
                    'gated' => false,
                    'words' => 20,
                    'descriptor' => SystemDesignRubric::descriptor('requirements', 4),
                    'evidence' => 'redirect fast',
                    'improvement' => 'Name what is out of scope.',
                    'keyPoints' => ['covered' => ['Separates creating a link from following one'], 'missed' => ['Puts a number on redirect latency']],
                ]]],
                'rubric_version' => 'sd-1',
                'created_at' => $at,
            ])
            ->create();
    }

    public function test_both_routes_need_a_token(): void
    {
        $this->getJson('/api/practice/attempts')->assertUnauthorized();
        $this->getJson('/api/practice/attempts/1')->assertUnauthorized();
    }

    public function test_the_list_is_the_users_attempts_in_every_mode_newest_first(): void
    {
        $quiz = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python, 'topic' => 'iteration', 'difficulty' => 'easy']);
        $snippet = PracticeQuestion::factory()->codeReview()->create(['difficulty' => 'medium']);
        $scenario = PracticeQuestion::factory()->systemDesign()->create(['difficulty' => 'hard']);

        $answer = $this->quizAttempt($quiz, $quiz->correctChoice(), '2026-11-20 09:00:00');
        $review = $this->reviewAttempt($snippet, '2026-11-22 09:00:00');
        $design = $this->designAttempt($scenario, '2026-11-21 09:00:00');
        $this->quizAttempt($quiz, null, '2026-11-25 09:00:00', User::factory()->create());

        $this->signIn();
        $response = $this->getJson('/api/practice/attempts')
            ->assertOk()
            ->assertJsonPath('meta', ['page' => 1, 'perPage' => 20, 'total' => 3, 'lastPage' => 1]);

        $this->assertSame([$review->id, $design->id, $answer->id], array_column($response->json('attempts'), 'id'));

        $this->assertSame([
            'id' => $review->id,
            'kind' => 'code_review',
            'title' => $snippet->topic,
            'language' => 'javascript',
            'topic' => null,
            'topicLabel' => null,
            'difficulty' => 'medium',
            'score' => 42,
            'maxScore' => 100,
            'correct' => null,
            'createdAt' => Carbon::parse('2026-11-22 09:00:00')->toJSON(),
        ], $response->json('attempts.0'));

        $response->assertJsonPath('attempts.1.kind', 'system_design')
            ->assertJsonPath('attempts.1.title', $scenario->topic)
            ->assertJsonPath('attempts.1.language', null)
            ->assertJsonPath('attempts.1.score', 12);

        // A quiz attempt is titled by its question, with the topic's name.
        $response->assertJsonPath('attempts.2.kind', 'quiz')
            ->assertJsonPath('attempts.2.title', $quiz->prompt)
            ->assertJsonPath('attempts.2.language', 'python')
            ->assertJsonPath('attempts.2.topic', 'iteration')
            ->assertJsonPath('attempts.2.topicLabel', 'Comprehensions, iterators & generators')
            ->assertJsonPath('attempts.2.correct', true)
            ->assertJsonPath('attempts.2.score', 1)
            ->assertJsonPath('attempts.2.maxScore', 1);

        // The list says how each went, never what the answer was.
        $body = $response->getContent();
        $this->assertStringNotContainsString(json_encode($quiz->correctChoice()), $body);
        $this->assertStringNotContainsString($quiz->explanation, $body);
        $this->assertStringNotContainsString($snippet->answer['issues'][0]['summary'], $body);
    }

    public function test_the_list_filters_by_kind_and_comes_in_pages_of_twenty(): void
    {
        $question = PracticeQuestion::factory()->create();
        foreach (range(1, 22) as $i) {
            $this->quizAttempt($question, $question->correctChoice(), sprintf('2026-11-01 09:%02d:00', $i));
        }
        $review = $this->reviewAttempt(PracticeQuestion::factory()->codeReview()->create(), '2026-10-01 09:00:00');

        $this->signIn();
        $first = $this->getJson('/api/practice/attempts')->assertOk();
        $this->assertCount(20, $first->json('attempts'));
        $first->assertJsonPath('meta.total', 23)->assertJsonPath('meta.lastPage', 2);

        $second = $this->getJson('/api/practice/attempts?page=2')->assertOk();
        $this->assertCount(3, $second->json('attempts'));
        $second->assertJsonPath('attempts.2.id', $review->id);

        $this->getJson('/api/practice/attempts?kind=code_review')
            ->assertOk()
            ->assertJsonCount(1, 'attempts')
            ->assertJsonPath('attempts.0.id', $review->id);
        $this->getJson('/api/practice/attempts?kind=quiz')->assertOk()->assertJsonPath('meta.total', 22);
        $this->getJson('/api/practice/attempts?kind=system_design')->assertOk()->assertJsonCount(0, 'attempts');

        $this->getJson('/api/practice/attempts?kind=problems')->assertUnprocessable()->assertJsonValidationErrors('kind');
        $this->getJson('/api/practice/attempts?page=0')->assertUnprocessable()->assertJsonValidationErrors('page');
    }

    public function test_a_quiz_attempt_comes_back_with_its_question_the_choice_the_key_and_why(): void
    {
        $question = PracticeQuestion::factory()
            ->withOptions(['0', '1', 'undefined', 'ReferenceError'], 'undefined')
            ->create([
                'topic' => 'scope',
                'difficulty' => 'easy',
                'prompt' => 'What does this print?',
                'code' => "console.log(x);\nvar x = 1;",
                'explanation' => 'var is hoisted and starts as undefined.',
            ]);
        $attempt = $this->quizAttempt($question, 'ReferenceError', '2026-11-20 09:00:00');

        $this->signIn();
        $this->getJson("/api/practice/attempts/{$attempt->id}")
            ->assertOk()
            ->assertExactJson([
                'id' => $attempt->id,
                'kind' => 'quiz',
                'score' => 0,
                'maxScore' => 1,
                'correct' => false,
                'rubricVersion' => null,
                'createdAt' => Carbon::parse('2026-11-20 09:00:00')->toJSON(),
                'result' => [
                    'question' => [
                        'id' => $question->id,
                        'language' => 'javascript',
                        'topic' => 'scope',
                        'topicLabel' => 'Scope, hoisting & closures',
                        'difficulty' => 'easy',
                        'prompt' => 'What does this print?',
                        'code' => "console.log(x);\nvar x = 1;",
                        // In the bank's order: this is a record, not a round.
                        'options' => ['0', '1', 'undefined', 'ReferenceError'],
                        'published' => true,
                    ],
                    'choice' => 'ReferenceError',
                    'correct' => false,
                    'answer' => 'undefined',
                    'explanation' => 'var is hoisted and starts as undefined.',
                ],
            ]);
    }

    public function test_a_quiz_attempt_still_reads_back_once_its_question_is_unpublished(): void
    {
        $question = PracticeQuestion::factory()->draft()->create();
        $attempt = $this->quizAttempt($question, null, '2026-11-20 09:00:00');

        $this->signIn();
        $this->getJson("/api/practice/attempts/{$attempt->id}")
            ->assertOk()
            ->assertJsonPath('result.question.published', false)
            ->assertJsonPath('result.choice', null)
            ->assertJsonPath('result.correct', false);
    }

    public function test_a_code_review_attempt_reads_back_as_the_code_reviews_own_result(): void
    {
        $user = $this->signIn(User::factory()->premium()->create());
        $attempt = $this->reviewAttempt(PracticeQuestion::factory()->codeReview()->create(), '2026-11-20 09:00:00', $user);

        $own = $this->getJson("/api/practice/code-review/reviews/{$attempt->id}")->assertOk()->json();

        $this->getJson("/api/practice/attempts/{$attempt->id}")
            ->assertOk()
            ->assertJsonPath('kind', 'code_review')
            ->assertJsonPath('score', 42)
            ->assertJsonPath('rubricVersion', 'cr-1')
            ->assertJsonPath('result', $own);
    }

    public function test_a_system_design_attempt_reads_back_with_its_report_the_answer_and_the_rubric(): void
    {
        $scenario = PracticeQuestion::factory()->systemDesign()->create(['difficulty' => 'easy']);
        $attempt = $this->designAttempt($scenario, '2026-11-20 09:00:00');

        $this->signIn();
        $response = $this->getJson("/api/practice/attempts/{$attempt->id}")
            ->assertOk()
            ->assertJsonPath('kind', 'system_design')
            ->assertJsonPath('rubricVersion', 'sd-1')
            ->assertJsonPath('result.scenario', [
                'id' => $scenario->id,
                'title' => $scenario->topic,
                'difficulty' => 'easy',
                'prompt' => $scenario->prompt,
            ])
            ->assertJsonPath('result.report', [
                'attemptId' => $attempt->id,
                'questionId' => $scenario->id,
                'rubricVersion' => 'sd-1',
                'score' => 12,
                'maxScore' => 100,
                'traits' => $attempt->feedback['traits'],
                'explanation' => $scenario->explanation,
            ])
            ->assertJsonPath('result.rubric', SystemDesignRubric::present());

        // Every section, '' where nothing was written.
        $this->assertSame([
            'requirements' => 'Short links that redirect fast.',
            'estimates' => '',
            'api' => 'POST /links',
            'data_model' => '',
            'high_level' => '',
            'deep_dive' => '',
            'tradeoffs' => '',
        ], $response->json('result.sections'));

        // The report reveals the key points as the attempt stored them: the
        // scenario's other key points stay on the server.
        $this->assertStringNotContainsString($scenario->answer['keyPoints']['scalability'][0], $response->getContent());
    }

    public function test_someone_elses_attempt_or_an_unknown_id_is_a_404(): void
    {
        $other = User::factory()->premium()->create();
        $quiz = $this->quizAttempt(PracticeQuestion::factory()->create(), null, '2026-11-20 09:00:00', $other);
        $review = $this->reviewAttempt(PracticeQuestion::factory()->codeReview()->create(), '2026-11-20 09:00:00', $other);
        $design = $this->designAttempt(PracticeQuestion::factory()->systemDesign()->create(), '2026-11-20 09:00:00', $other);

        $this->signIn();
        foreach ([$quiz, $review, $design] as $attempt) {
            $this->getJson("/api/practice/attempts/{$attempt->id}")->assertNotFound()->assertJsonMissingPath('result');
        }
        $this->getJson('/api/practice/attempts/99999')->assertNotFound();
        $this->getJson('/api/practice/attempts')->assertOk()->assertJsonCount(0, 'attempts');
    }

    public function test_reading_history_is_free_on_any_plan_and_never_calls_a_model(): void
    {
        $gemini = FakeGeminiService::swap();
        // A free account keeps its reviews from when it had Premium.
        $review = $this->reviewAttempt(PracticeQuestion::factory()->codeReview()->create(), '2026-11-20 09:00:00');
        $design = $this->designAttempt(PracticeQuestion::factory()->systemDesign()->create(), '2026-11-21 09:00:00');

        $this->signIn();
        $this->getJson('/api/practice/attempts')->assertOk()->assertJsonCount(2, 'attempts');
        $this->getJson("/api/practice/attempts/{$review->id}")->assertOk();
        $this->getJson("/api/practice/attempts/{$design->id}")->assertOk();

        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::query()->count());
    }
}
