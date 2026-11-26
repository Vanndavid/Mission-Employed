<?php

namespace Tests\Feature;

use App\Enums\CodeReviewCategory;
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
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/practice/progress: how practice is going in every mode, worked out
 * from the user's stored attempts. Counts and averages cover the last 30
 * days; each area also lists its latest results, newest first, for the coach
 * on Mission Control to weigh. A read of the user's own data: no plan
 * feature, no model call, and no answer key in it.
 */
class PracticeProgressTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-11-26 12:00:00';

    private const OLD = '2026-10-01 09:00:00';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(Carbon::parse(self::NOW));
        $this->user = User::factory()->create();
    }

    private function progress(): TestResponse
    {
        Sanctum::actingAs($this->user);

        return $this->getJson('/api/practice/progress')->assertOk();
    }

    private function answered(PracticeQuestion $question, bool $correct, string $at, ?User $user = null): PracticeAttempt
    {
        return PracticeAttempt::factory()
            ->for($user ?? $this->user)
            ->for($question, 'question')
            ->state(['correct' => $correct, 'score' => $correct ? 1 : 0, 'created_at' => $at])
            ->create();
    }

    /**
     * A scored review of a snippet made with PracticeQuestionFactory::codeReview().
     *
     * @param  list<string>  $found  ids of the planted issues it found
     */
    private function reviewed(PracticeQuestion $snippet, array $found, string $at, int $score): PracticeAttempt
    {
        $issues = array_map(fn (array $issue) => [
            ...$issue,
            'found' => in_array($issue['id'], $found, true),
            'comments' => in_array($issue['id'], $found, true) ? [0] : [],
            'fixVerdict' => in_array($issue['id'], $found, true) ? 'yes' : null,
        ], $snippet->answer['issues']);

        return PracticeAttempt::factory()
            ->codeReview()
            ->for($this->user)
            ->for($snippet, 'question')
            ->state(fn (array $attributes) => [
                'score' => $score,
                'feedback' => [...$attributes['feedback'], 'issues' => $issues],
                'created_at' => $at,
            ])
            ->create();
    }

    /**
     * A scored system design answer, each trait at the rating given (0 to 4)
     * and weighted the way the rubric weights it.
     *
     * @param  array<string, int>  $ratings  trait => rating; a trait left out is rated 0
     */
    private function designed(PracticeQuestion $scenario, array $ratings, string $at): PracticeAttempt
    {
        $traits = [];
        foreach (SystemDesignRubric::TRAITS as $key => $trait) {
            $score = $ratings[$key] ?? 0;
            $traits[] = [
                'key' => $key,
                'label' => $trait['label'],
                'score' => $score,
                'max' => SystemDesignRubric::TRAIT_MAX,
                'points' => SystemDesignRubric::points($key, $score),
                'maxPoints' => $trait['weight'],
                'gated' => $score === 0,
                'words' => 40,
                'descriptor' => SystemDesignRubric::descriptor($key, $score),
                'evidence' => null,
                'improvement' => null,
                'keyPoints' => ['covered' => [], 'missed' => $scenario->answer['keyPoints'][$key] ?? []],
            ];
        }

        return PracticeAttempt::factory()
            ->for($this->user)
            ->for($scenario, 'question')
            ->state([
                'kind' => PracticeKind::SystemDesign,
                'response' => ['sections' => SystemDesignRubric::normaliseSections([])],
                'score' => SystemDesignRubric::total($ratings),
                'max_score' => SystemDesignRubric::MAX_SCORE,
                'correct' => null,
                'feedback' => ['traits' => $traits],
                'rubric_version' => SystemDesignRubric::VERSION,
                'created_at' => $at,
            ])
            ->create();
    }

    /** @return array<string, mixed> */
    private function only(array $row, array $keys): array
    {
        return array_intersect_key($row, array_flip($keys));
    }

    private function at(string $time): string
    {
        return Carbon::parse($time)->toJSON();
    }

    public function test_it_needs_a_token(): void
    {
        $this->getJson('/api/practice/progress')->assertUnauthorized();
    }

    public function test_an_account_that_has_not_practised_gets_every_mode_empty(): void
    {
        $response = $this->progress()
            ->assertJsonPath('windowDays', 30)
            ->assertJsonPath('quiz.attempts', 0)
            ->assertJsonPath('quiz.averageScore', null)
            ->assertJsonPath('quiz.lastAttemptAt', null)
            ->assertJsonPath('quiz.openMistakes', 0)
            ->assertJsonPath('codeReview.attempts', 0)
            ->assertJsonPath('codeReview.averageScore', null)
            ->assertJsonPath('systemDesign.attempts', 0)
            ->assertJsonPath('systemDesign.averageScore', null);

        // Every language and topic, category and trait is listed, so the
        // client can tell "never tried" from "not in the response".
        $this->assertSame(PracticeLanguage::values(), array_column($response->json('quiz.languages'), 'key'));
        $javascript = $response->json('quiz.languages.0');
        $this->assertSame(array_keys(PracticeLanguage::JavaScript->topics()), array_column($javascript['topics'], 'key'));
        $this->assertSame(
            ['key' => 'scope', 'label' => 'Scope, hoisting & closures', 'answered' => 0, 'correct' => 0, 'accuracy' => null, 'openMistakes' => 0, 'recent' => []],
            $javascript['topics'][0],
        );

        $this->assertSame(CodeReviewCategory::values(), array_column($response->json('codeReview.categories'), 'key'));
        $this->assertSame(
            ['key' => 'bug', 'label' => 'Bug', 'planted' => 0, 'found' => 0, 'foundRate' => null, 'recent' => []],
            $response->json('codeReview.categories.0'),
        );

        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_column($response->json('systemDesign.traits'), 'key'));
        $this->assertSame(
            ['key' => 'requirements', 'label' => 'Requirements and scope', 'maxPoints' => 12, 'attempts' => 0, 'averagePoints' => null, 'average' => null, 'recent' => []],
            $response->json('systemDesign.traits.0'),
        );
    }

    public function test_quiz_progress_is_accuracy_per_language_and_topic_over_the_last_30_days(): void
    {
        $scope = PracticeQuestion::factory()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'scope']);
        $async = PracticeQuestion::factory()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        $asyncOld = PracticeQuestion::factory()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);
        $python = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python, 'topic' => 'types']);
        $draft = PracticeQuestion::factory()->draft()->create(['language' => PracticeLanguage::JavaScript, 'topic' => 'async']);

        $this->answered($scope, false, '2026-11-20 09:00:00');
        $this->answered($scope, true, '2026-11-25 09:00:00');
        $this->answered($async, false, '2026-11-24 09:00:00');
        // Outside the window: not counted, but still an open mistake and
        // still one of the topic's latest results.
        $this->answered($asyncOld, false, self::OLD);
        $this->answered($python, true, '2026-11-22 09:00:00');
        // A draft is not something a user can see, as on the quiz's own progress.
        $this->answered($draft, false, '2026-11-23 09:00:00');
        // Someone else's answers are not this user's progress.
        $this->answered($scope, false, '2026-11-25 10:00:00', User::factory()->create());

        $response = $this->progress()
            ->assertJsonPath('quiz.kind', 'quiz')
            ->assertJsonPath('quiz.attempts', 4)
            ->assertJsonPath('quiz.averageScore', 50)
            ->assertJsonPath('quiz.openMistakes', 2)
            ->assertJsonPath('quiz.lastAttemptAt', $this->at('2026-11-25 09:00:00'));

        $languages = collect($response->json('quiz.languages'))->keyBy('key');
        $this->assertSame(
            ['label' => 'JavaScript', 'answered' => 3, 'correct' => 1, 'accuracy' => 33, 'openMistakes' => 2],
            $this->only($languages['javascript'], ['label', 'answered', 'correct', 'accuracy', 'openMistakes']),
        );
        $this->assertSame(
            ['answered' => 1, 'correct' => 1, 'accuracy' => 100, 'openMistakes' => 0],
            $this->only($languages['python'], ['answered', 'correct', 'accuracy', 'openMistakes']),
        );

        $topics = collect($languages['javascript']['topics'])->keyBy('key');
        $this->assertSame(
            ['answered' => 2, 'correct' => 1, 'accuracy' => 50, 'openMistakes' => 0],
            $this->only($topics['scope'], ['answered', 'correct', 'accuracy', 'openMistakes']),
        );
        $this->assertSame([
            ['at' => $this->at('2026-11-25 09:00:00'), 'points' => 1, 'maxPoints' => 1],
            ['at' => $this->at('2026-11-20 09:00:00'), 'points' => 0, 'maxPoints' => 1],
        ], $topics['scope']['recent']);

        $this->assertSame(
            ['answered' => 1, 'correct' => 0, 'accuracy' => 0, 'openMistakes' => 2],
            $this->only($topics['async'], ['answered', 'correct', 'accuracy', 'openMistakes']),
        );
        $this->assertSame([
            ['at' => $this->at('2026-11-24 09:00:00'), 'points' => 0, 'maxPoints' => 1],
            ['at' => $this->at(self::OLD), 'points' => 0, 'maxPoints' => 1],
        ], $topics['async']['recent']);
    }

    public function test_each_area_lists_at_most_its_ten_latest_results(): void
    {
        $question = PracticeQuestion::factory()->create(['topic' => 'scope']);
        foreach (range(1, 12) as $day) {
            $this->answered($question, $day % 2 === 0, sprintf('2026-11-%02d 09:00:00', $day + 10));
        }

        $recent = $this->progress()->json('quiz.languages.0.topics.0.recent');

        $this->assertCount(10, $recent);
        $this->assertSame($this->at('2026-11-22 09:00:00'), $recent[0]['at']);
        $this->assertSame($this->at('2026-11-13 09:00:00'), $recent[9]['at']);
    }

    public function test_code_review_progress_is_the_found_rate_per_issue_category(): void
    {
        // Planted: sql-injection (security, severity 3) and off-by-one (bug, severity 1).
        $snippet = PracticeQuestion::factory()->codeReview()->create();

        $this->reviewed($snippet, ['sql-injection'], '2026-11-20 09:00:00', 60);
        $this->reviewed($snippet, ['sql-injection', 'off-by-one'], '2026-11-25 09:00:00', 90);
        $this->reviewed($snippet, [], self::OLD, 5);

        $response = $this->progress()
            ->assertJsonPath('codeReview.kind', 'code_review')
            ->assertJsonPath('codeReview.attempts', 2)
            ->assertJsonPath('codeReview.averageScore', 75)
            ->assertJsonPath('codeReview.lastAttemptAt', $this->at('2026-11-25 09:00:00'));

        $categories = collect($response->json('codeReview.categories'))->keyBy('key');
        $this->assertSame(['planted' => 2, 'found' => 2, 'foundRate' => 100], $this->only($categories['security'], ['planted', 'found', 'foundRate']));
        $this->assertSame(['planted' => 2, 'found' => 1, 'foundRate' => 50], $this->only($categories['bug'], ['planted', 'found', 'foundRate']));
        $this->assertSame(['planted' => 0, 'found' => 0, 'foundRate' => null], $this->only($categories['performance'], ['planted', 'found', 'foundRate']));

        // Each result is the detection points the category was worth in that
        // review, and how many of them it earned: 70 x its severity over the
        // review's, so the security issue carries 52.5 and the bug 17.5.
        $this->assertEquals([
            ['at' => $this->at('2026-11-25 09:00:00'), 'points' => 52.5, 'maxPoints' => 52.5],
            ['at' => $this->at('2026-11-20 09:00:00'), 'points' => 52.5, 'maxPoints' => 52.5],
            ['at' => $this->at(self::OLD), 'points' => 0, 'maxPoints' => 52.5],
        ], $categories['security']['recent']);
        $this->assertEquals([
            ['at' => $this->at('2026-11-25 09:00:00'), 'points' => 17.5, 'maxPoints' => 17.5],
            ['at' => $this->at('2026-11-20 09:00:00'), 'points' => 0, 'maxPoints' => 17.5],
            ['at' => $this->at(self::OLD), 'points' => 0, 'maxPoints' => 17.5],
        ], $categories['bug']['recent']);
        $this->assertSame([], $categories['performance']['recent']);
    }

    public function test_system_design_progress_is_the_average_per_trait(): void
    {
        $scenario = PracticeQuestion::factory()->systemDesign()->create();
        $all = fn (int $rating) => array_fill_keys(array_keys(SystemDesignRubric::TRAITS), $rating);

        $this->designed($scenario, $all(2), '2026-11-20 09:00:00');
        $this->designed($scenario, [...$all(4), 'estimation' => 0], '2026-11-24 09:00:00');
        $this->designed($scenario, $all(0), self::OLD);

        $response = $this->progress()
            ->assertJsonPath('systemDesign.kind', 'system_design')
            ->assertJsonPath('systemDesign.attempts', 2)
            // 50 and 88.
            ->assertJsonPath('systemDesign.averageScore', 69)
            ->assertJsonPath('systemDesign.lastAttemptAt', $this->at('2026-11-24 09:00:00'));

        $traits = collect($response->json('systemDesign.traits'))->keyBy('key');
        $this->assertEquals(
            ['label' => 'Requirements and scope', 'maxPoints' => 12, 'attempts' => 2, 'averagePoints' => 9, 'average' => 75],
            $this->only($traits['requirements'], ['label', 'maxPoints', 'attempts', 'averagePoints', 'average']),
        );
        $this->assertEquals(
            ['maxPoints' => 12, 'attempts' => 2, 'averagePoints' => 3, 'average' => 25],
            $this->only($traits['estimation'], ['maxPoints', 'attempts', 'averagePoints', 'average']),
        );
        $this->assertEquals([
            ['at' => $this->at('2026-11-24 09:00:00'), 'points' => 0, 'maxPoints' => 12],
            ['at' => $this->at('2026-11-20 09:00:00'), 'points' => 6, 'maxPoints' => 12],
            ['at' => $this->at(self::OLD), 'points' => 0, 'maxPoints' => 12],
        ], $traits['estimation']['recent']);
    }

    public function test_reading_progress_is_free_on_any_plan_and_never_calls_a_model(): void
    {
        $gemini = FakeGeminiService::swap();
        // A free account that once had Premium still sees its reviews counted.
        $this->reviewed(PracticeQuestion::factory()->codeReview()->create(), ['sql-injection'], '2026-11-20 09:00:00', 60);

        $this->progress()->assertJsonPath('codeReview.attempts', 1);

        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::query()->count());
    }

    public function test_progress_never_carries_an_answer_key(): void
    {
        $quiz = PracticeQuestion::factory()->create();
        $unanswered = PracticeQuestion::factory()->create();
        $snippet = PracticeQuestion::factory()->codeReview()->create();
        $scenario = PracticeQuestion::factory()->systemDesign()->create();
        $this->answered($quiz, false, '2026-11-20 09:00:00');
        $this->reviewed($snippet, [], '2026-11-20 09:00:00', 10);
        $this->designed($scenario, ['requirements' => 2], '2026-11-20 09:00:00');

        $body = $this->progress()->getContent();

        foreach ([$quiz, $unanswered] as $question) {
            $this->assertStringNotContainsString(json_encode($question->correctChoice()), $body);
            $this->assertStringNotContainsString($question->explanation, $body);
        }
        $this->assertStringNotContainsString($snippet->answer['issues'][0]['summary'], $body);
        $this->assertStringNotContainsString($scenario->answer['keyPoints']['requirements'][0], $body);
    }
}
