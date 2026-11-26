<?php

namespace Tests\Feature;

use App\Enums\Feature;
use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\FeatureUsage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Code review practice: review a snippet like a pull request, and get a score
 * for how many of its planted issues the comments found.
 *
 * Same split as the ATS check: the model only matches comments to the
 * planted issues, and code computes the score. The planted issues never
 * leave the server before a review is in, and the model's answer is
 * untrusted: unknown issue ids, comment indexes past the end and duplicates
 * are dropped before anything is scored.
 */
class PracticeCodeReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->premium()->create();
        Sanctum::actingAs($this->user);
    }

    private function snippet(array $attributes = []): PracticeQuestion
    {
        return PracticeQuestion::factory()->codeReview()->create($attributes);
    }

    private function reviewed(PracticeQuestion $question, string $at, ?User $user = null): PracticeAttempt
    {
        return PracticeAttempt::factory()
            ->codeReview()
            ->for($user ?? $this->user)
            ->for($question, 'question')
            ->state(['created_at' => $at])
            ->create();
    }

    /** @param  list<array{line: int, body: string}>  $comments */
    private function review(PracticeQuestion $question, array $comments, ?string $summary = null): TestResponse
    {
        return $this->postJson("/api/practice/code-review/{$question->id}/reviews", array_filter([
            'comments' => $comments,
            'summary' => $summary,
        ], fn ($value) => $value !== null));
    }

    /** @return list<array{line: int, body: string}> */
    private function threeComments(): array
    {
        return [
            ['line' => 3, 'body' => 'The status goes straight into the SQL string. Bind it with a placeholder.'],
            ['line' => 20, 'body' => 'This variable name is unclear.'],
            ['line' => 22, 'body' => 'Nothing closes this handle.'],
        ];
    }

    private function uses(): int
    {
        return FeatureUsage::query()->where('feature', Feature::CodeReview)->count();
    }

    public function test_every_route_needs_a_token(): void
    {
        $this->app['auth']->forgetGuards();
        $question = $this->snippet();

        $this->getJson('/api/practice/code-review/next')->assertUnauthorized();
        $this->postJson("/api/practice/code-review/{$question->id}/reviews", ['comments' => [['line' => 1, 'body' => 'x']]])->assertUnauthorized();
        $this->getJson('/api/practice/code-review/reviews/1')->assertUnauthorized();
    }

    public function test_next_serves_a_snippet_without_its_planted_issues(): void
    {
        $question = $this->snippet(['difficulty' => 'medium']);

        $response = $this->getJson('/api/practice/code-review/next')->assertOk();

        $response->assertExactJson([
            'snippet' => [
                'id' => $question->id,
                'language' => 'javascript',
                'title' => $question->topic,
                'difficulty' => 'medium',
                'prompt' => $question->prompt,
                'code' => $question->code,
            ],
            'reviewedBefore' => false,
            'total' => 1,
            'unreviewed' => 1,
        ]);

        // Neither the key nor the takeaway is anywhere in it.
        $body = $response->getContent();
        $this->assertStringNotContainsString('answer', $body);
        $this->assertStringNotContainsString('sql-injection', $body);
        $this->assertStringNotContainsString('Bind it as a parameter', $body);
        $this->assertStringNotContainsString($question->explanation, $body);

        // Opening a snippet is free: it needs the feature but uses nothing.
        $this->assertSame(0, $this->uses());
    }

    public function test_next_prefers_a_snippet_the_user_has_not_reviewed(): void
    {
        $done = $this->snippet();
        $fresh = $this->snippet();
        $this->reviewed($done, '2026-11-01 10:00:00');
        // Someone else's review says nothing about this user.
        $this->reviewed($fresh, '2026-11-02 10:00:00', User::factory()->create());

        foreach (range(1, 5) as $ignored) {
            $this->getJson('/api/practice/code-review/next')
                ->assertOk()
                ->assertJsonPath('snippet.id', $fresh->id)
                ->assertJsonPath('reviewedBefore', false)
                ->assertJsonPath('total', 2)
                ->assertJsonPath('unreviewed', 1);
        }
    }

    public function test_once_everything_is_reviewed_the_least_recent_comes_back(): void
    {
        $older = $this->snippet();
        $newer = $this->snippet();
        $this->reviewed($older, '2026-11-01 10:00:00');
        $this->reviewed($newer, '2026-11-03 10:00:00');
        // Reviewed again since: its latest review is what counts.
        $this->reviewed($older, '2026-11-05 10:00:00');

        $this->getJson('/api/practice/code-review/next')
            ->assertOk()
            ->assertJsonPath('snippet.id', $newer->id)
            ->assertJsonPath('reviewedBefore', true)
            ->assertJsonPath('unreviewed', 0);
    }

    public function test_next_can_skip_the_snippet_on_screen(): void
    {
        $first = $this->snippet();
        $second = $this->snippet();

        $this->getJson("/api/practice/code-review/next?exclude={$first->id}")->assertJsonPath('snippet.id', $second->id);
        $this->getJson("/api/practice/code-review/next?exclude={$second->id}")->assertJsonPath('snippet.id', $first->id);

        // With nothing else to serve, the excluded one is better than none.
        $second->delete();
        $this->getJson("/api/practice/code-review/next?exclude={$first->id}")->assertJsonPath('snippet.id', $first->id);
    }

    public function test_next_filters_by_language_and_difficulty_and_serves_only_published_reviews(): void
    {
        $python = $this->snippet(['language' => PracticeLanguage::Python, 'difficulty' => 'hard']);
        $this->snippet(['language' => PracticeLanguage::Python, 'difficulty' => 'easy']);
        $this->snippet(['language' => PracticeLanguage::Java, 'difficulty' => 'hard']);
        PracticeQuestion::factory()->codeReview()->draft()->create(['language' => PracticeLanguage::Python, 'difficulty' => 'hard']);
        PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python, 'difficulty' => 'hard']);

        $this->getJson('/api/practice/code-review/next?language=python&difficulty=hard')
            ->assertOk()
            ->assertJsonPath('snippet.id', $python->id)
            ->assertJsonPath('total', 1);

        $this->getJson('/api/practice/code-review/next?language=sql')
            ->assertOk()
            ->assertExactJson(['snippet' => null, 'reviewedBefore' => false, 'total' => 0, 'unreviewed' => 0]);
    }

    public function test_next_rejects_an_unknown_language_or_difficulty(): void
    {
        $this->getJson('/api/practice/code-review/next?language=cobol')->assertUnprocessable()->assertJsonValidationErrors('language');
        $this->getJson('/api/practice/code-review/next?difficulty=brutal')->assertUnprocessable()->assertJsonValidationErrors('difficulty');
    }

    public function test_a_review_is_matched_by_the_model_and_scored_in_code(): void
    {
        $question = $this->snippet();
        $gemini = FakeGeminiService::swap()->queueJson([
            'issues' => [
                ['id' => 'sql-injection', 'comments' => [0], 'fix' => 'yes'],
                ['id' => 'off-by-one', 'comments' => [], 'fix' => 'no'],
            ],
            'bonus' => [['comment' => 2, 'note' => 'The handle does leak.']],
        ]);

        $response = $this->review($question, $this->threeComments(), 'Mostly fine, one injection.')->assertCreated();

        // Detection 70 x 3/4, fixes 20 x 3/4, precision 10 x 2/3.
        $response
            ->assertJsonPath('score', 53 + 15 + 7)
            ->assertJsonPath('maxScore', 100)
            ->assertJsonPath('rubricVersion', 'cr-1')
            ->assertJsonPath('breakdown.detection', ['points' => 53, 'max' => 70, 'found' => 1, 'total' => 2, 'severityFound' => 3, 'severityTotal' => 4])
            ->assertJsonPath('breakdown.fixes', ['points' => 15, 'max' => 20])
            ->assertJsonPath('breakdown.precision', ['points' => 7, 'max' => 10, 'useful' => 2, 'comments' => 3])
            ->assertJsonPath('snippet.id', $question->id)
            ->assertJsonPath('summary', 'Mostly fine, one injection.')
            ->assertJsonPath('takeaway', 'Check every value that reaches a query.')
            ->assertJsonPath('bonus', [['comment' => 2, 'note' => 'The handle does leak.']]);

        // Every planted issue, found or missed, with its summary and fix revealed.
        $response->assertJsonPath('issues', [
            ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'The status is pasted into the SQL.', 'fix' => 'Bind it as a parameter.', 'found' => true, 'comments' => [0], 'fixVerdict' => 'yes'],
            ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 1, 'summary' => 'Page 1 skips the first rows.', 'fix' => 'Offset by (page - 1) * size.', 'found' => false, 'comments' => [], 'fixVerdict' => null],
        ]);

        // The user's comments, marked up.
        $response->assertJsonPath('comments', [
            ['line' => 3, 'body' => $this->threeComments()[0]['body'], 'issues' => ['sql-injection'], 'bonus' => false, 'note' => null],
            ['line' => 20, 'body' => 'This variable name is unclear.', 'issues' => [], 'bonus' => false, 'note' => null],
            ['line' => 22, 'body' => 'Nothing closes this handle.', 'issues' => [], 'bonus' => true, 'note' => 'The handle does leak.'],
        ]);

        // One model call, carrying the planted issues, the comments and which
        // comments sit on an issue's lines.
        $gemini->assertCallCount('generateJson', 1)
            ->assertPromptContains('The status is pasted into the SQL.')
            ->assertPromptContains('Bind it as a parameter.')
            ->assertPromptContains('The status goes straight into the SQL string.')
            ->assertPromptContains('[0] line 3 (on the lines of: sql-injection)')
            ->assertPromptContains('[1] line 20 (on no planted issue\'s lines)')
            ->assertPromptContains('Mostly fine, one injection.')
            ->assertPromptContains('  3 | const line3 = 3;');
        $schema = $gemini->lastCall('generateJson')['responseSchema'];
        $this->assertSame(['sql-injection', 'off-by-one'], $schema['properties']['issues']['items']['properties']['id']['enum']);

        // Stored, append-only, against the rubric it was scored with.
        $attempt = PracticeAttempt::sole();
        $this->assertSame($this->user->id, $attempt->user_id);
        $this->assertSame($question->id, $attempt->practice_question_id);
        $this->assertSame(PracticeKind::CodeReview, $attempt->kind);
        $this->assertSame(75, $attempt->score);
        $this->assertSame(100, $attempt->max_score);
        $this->assertNull($attempt->correct);
        $this->assertSame('cr-1', $attempt->rubric_version);
        $this->assertSame(['comments' => $this->threeComments(), 'summary' => 'Mostly fine, one injection.'], $attempt->response);
        $this->assertSame('security', $attempt->feedback['issues'][0]['category']);
        $this->assertTrue($attempt->feedback['issues'][0]['found']);
        $response->assertJsonPath('id', $attempt->id);

        $this->assertSame(1, $this->uses());
    }

    public function test_bogus_ids_indexes_and_duplicates_from_the_model_are_ignored(): void
    {
        $question = $this->snippet();
        FakeGeminiService::swap()->queueJson([
            'issues' => [
                ['id' => 'made-up', 'comments' => [0, 1, 2], 'fix' => 'yes'],
                ['id' => 'off-by-one', 'comments' => [1, 1, 7, -1, '2', 'x', 1.5], 'fix' => 'certainly'],
                ['id' => 'off-by-one', 'comments' => [0], 'fix' => 'yes'],
                ['id' => 42, 'comments' => [0]],
                'not an object',
            ],
            'bonus' => [
                ['comment' => 1, 'note' => 'Already a match, so not a bonus.'],
                ['comment' => 2, 'note' => '  A fair   point.  '],
                ['comment' => 2, 'note' => 'The same comment again.'],
                ['comment' => 9, 'note' => 'No such comment.'],
                ['comment' => 0, 'note' => ['not text']],
                ['note' => 'No comment index.'],
            ],
            'score' => 100,
        ]);

        $response = $this->review($question, $this->threeComments())->assertCreated();

        // Only off-by-one (severity 1 of 4) found, by comment 1, with no fix
        // verdict worth anything; comments 1 and 2 were useful.
        $response
            ->assertJsonPath('issues.0.found', false)
            ->assertJsonPath('issues.1.found', true)
            ->assertJsonPath('issues.1.comments', [1, 2])
            ->assertJsonPath('issues.1.fixVerdict', 'no')
            ->assertJsonPath('bonus', [['comment' => 0, 'note' => '']])
            ->assertJsonPath('breakdown.detection.points', 18)
            ->assertJsonPath('breakdown.fixes.points', 0)
            ->assertJsonPath('breakdown.precision', ['points' => 10, 'max' => 10, 'useful' => 3, 'comments' => 3])
            ->assertJsonPath('score', 28);
    }

    public function test_an_answer_that_is_not_the_schema_finds_nothing(): void
    {
        $question = $this->snippet();
        FakeGeminiService::swap()->queueJson(['issues' => 'all of them', 'bonus' => 'yes']);

        $this->review($question, $this->threeComments())
            ->assertCreated()
            ->assertJsonPath('score', 0)
            ->assertJsonPath('bonus', [])
            ->assertJsonPath('issues.0.found', false);
    }

    public function test_a_bonus_note_is_cleaned_and_capped(): void
    {
        $question = $this->snippet();
        FakeGeminiService::swap()->queueJson([
            'issues' => [],
            'bonus' => [['comment' => 0, 'note' => str_repeat('long ', 200)]],
        ]);

        $note = $this->review($question, $this->threeComments())->assertCreated()->json('bonus.0.note');

        $this->assertLessThanOrEqual(300, mb_strlen($note));
        $this->assertStringStartsWith('long long', $note);
    }

    public function test_a_review_needs_at_least_one_comment_on_a_line_of_the_snippet(): void
    {
        $question = $this->snippet();
        $gemini = FakeGeminiService::swap();

        $this->review($question, [])->assertUnprocessable()->assertJsonValidationErrors('comments');
        $this->review($question, [['line' => 25, 'body' => 'Past the end.']])->assertUnprocessable()->assertJsonValidationErrors('comments.0.line');
        $this->review($question, [['line' => 0, 'body' => 'Before the start.']])->assertUnprocessable()->assertJsonValidationErrors('comments.0.line');
        $this->review($question, [['line' => 3, 'body' => '   ']])->assertUnprocessable()->assertJsonValidationErrors('comments.0.body');
        $this->review($question, [['line' => 3, 'body' => str_repeat('x', 2001)]])->assertUnprocessable()->assertJsonValidationErrors('comments.0.body');
        $this->review($question, array_fill(0, 41, ['line' => 3, 'body' => 'Again.']))->assertUnprocessable()->assertJsonValidationErrors('comments');

        $gemini->assertNothingSent();
        $this->assertSame(0, $this->uses());
        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_a_draft_a_quiz_question_or_an_unknown_id_is_not_found(): void
    {
        $draft = PracticeQuestion::factory()->codeReview()->draft()->create();
        $quiz = PracticeQuestion::factory()->create();
        $gemini = FakeGeminiService::swap();
        $comments = [['line' => 3, 'body' => 'Injection.']];

        $this->review($draft, $comments)->assertNotFound();
        $this->review($quiz, $comments)->assertNotFound();
        $this->postJson('/api/practice/code-review/99999/reviews', ['comments' => $comments])->assertNotFound();

        $gemini->assertNothingSent();
        $this->assertSame(0, $this->uses());
    }

    public function test_a_free_user_is_refused_and_the_model_is_not_called(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $question = $this->snippet();
        $gemini = FakeGeminiService::swap();

        $this->getJson('/api/practice/code-review/next')
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required')
            ->assertJsonPath('feature', 'code_review');
        $this->review($question, $this->threeComments())
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_a_model_failure_is_a_502_with_no_use_counted_and_nothing_stored(): void
    {
        $question = $this->snippet();
        FakeGeminiService::swap()->throwOn('generateJson');

        $this->review($question, $this->threeComments())
            ->assertStatus(502)
            ->assertExactJson([
                'message' => 'The AI service is unavailable right now. Please try again in a moment.',
                'code' => 'ai_unavailable',
            ]);

        $this->assertSame(0, $this->uses());
        $this->assertSame(0, PracticeAttempt::count());
    }

    public function test_a_stored_review_can_be_read_back(): void
    {
        $question = $this->snippet();
        FakeGeminiService::swap()->queueJson([
            'issues' => [['id' => 'sql-injection', 'comments' => [0], 'fix' => 'partial']],
            'bonus' => [],
        ]);
        $scored = $this->review($question, $this->threeComments())->assertCreated()->json();

        $this->getJson("/api/practice/code-review/reviews/{$scored['id']}")
            ->assertOk()
            ->assertExactJson($scored);

        // Reading it back is free.
        $this->assertSame(1, $this->uses());
    }

    public function test_someone_elses_review_or_a_quiz_attempt_is_not_found(): void
    {
        $theirs = $this->reviewed($this->snippet(), '2026-11-01 10:00:00', User::factory()->create());
        $quiz = PracticeAttempt::factory()->for($this->user)->create();

        $this->getJson("/api/practice/code-review/reviews/{$theirs->id}")->assertNotFound();
        $this->getJson("/api/practice/code-review/reviews/{$quiz->id}")->assertNotFound();
        $this->getJson('/api/practice/code-review/reviews/99999')->assertNotFound();
    }
}
