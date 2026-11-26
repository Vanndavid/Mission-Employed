<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\PracticeQuestionReport;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The admin's question bank: every question of every kind, with its key,
 * review notes, attempts and open reports. Edits go through the same checks
 * as an AI draft, seed rows are fixed in their file rather than here, and a
 * question someone has answered is unpublished rather than deleted.
 */
class AdminQuestionBankTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function aiDraft(array $attributes = []): PracticeQuestion
    {
        return PracticeQuestion::factory()->draft()->create([
            'source' => PracticeQuestionSource::Ai,
            'options' => ['5', 'undefined', 'ReferenceError', 'null'],
            'answer' => ['choice' => 'undefined'],
            ...$attributes,
        ]);
    }

    public function test_only_an_admin_can_list_edit_delete_or_resolve(): void
    {
        $gemini = FakeGeminiService::swap();
        $question = $this->aiDraft();
        PracticeQuestionReport::factory()->for($question, 'question')->create();
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/admin/practice/questions')->assertForbidden()->assertJsonPath('code', 'admin_required');
        $this->patchJson("/api/admin/practice/questions/{$question->id}", ['status' => 'published'])
            ->assertForbidden()->assertJsonPath('code', 'admin_required');
        $this->deleteJson("/api/admin/practice/questions/{$question->id}")
            ->assertForbidden()->assertJsonPath('code', 'admin_required');
        $this->postJson("/api/admin/practice/questions/{$question->id}/reports/resolve")
            ->assertForbidden()->assertJsonPath('code', 'admin_required');

        $this->assertSame(PracticeQuestionStatus::Draft, $question->fresh()->status);
        $this->assertSame(1, PracticeQuestionReport::whereNull('resolved_at')->count());
        $gemini->assertNothingSent();
    }

    public function test_the_list_carries_what_an_admin_reviews_and_what_a_user_never_sees(): void
    {
        $this->actingAsAdmin();
        $question = $this->aiDraft([
            'review_notes' => ['distractors' => [['option' => '5', 'why' => 'The log runs first.']]],
        ]);
        PracticeAttempt::factory()->for($question, 'question')->count(2)->create();
        PracticeQuestionReport::factory()->for($question, 'question')->create(['reason' => 'The key looks wrong.']);
        PracticeQuestionReport::factory()->for($question, 'question')->resolved()->create(['reason' => 'Old and dealt with.']);

        $response = $this->getJson('/api/admin/practice/questions')->assertOk();

        $response->assertJsonPath('questions.0.id', $question->id);
        $response->assertJsonPath('questions.0.kind', 'quiz');
        $response->assertJsonPath('questions.0.answer', ['choice' => 'undefined']);
        $response->assertJsonPath('questions.0.explanation', $question->explanation);
        $response->assertJsonPath('questions.0.reviewNotes.distractors.0.why', 'The log runs first.');
        $response->assertJsonPath('questions.0.attemptCount', 2);
        $response->assertJsonPath('questions.0.openReports', 1);
        $response->assertJsonPath('questions.0.reports.0.reason', 'The key looks wrong.');
        $response->assertJsonCount(1, 'questions.0.reports');
        $response->assertJsonPath('meta.total', 1);
        // Which kinds the generate form can offer.
        $response->assertJsonPath('generators', ['quiz']);
    }

    public function test_it_filters_by_kind_status_language_topic_source_and_open_reports(): void
    {
        $this->actingAsAdmin();
        $draft = $this->aiDraft(['topic' => 'async']);
        $published = PracticeQuestion::factory()->create(['topic' => 'scope']);
        $python = PracticeQuestion::factory()->create(['language' => PracticeLanguage::Python, 'topic' => 'types']);
        $seed = PracticeQuestion::factory()->seeded('quiz-js-scope-01')->create(['topic' => 'scope']);
        $review = PracticeQuestion::factory()->create([
            'kind' => PracticeKind::CodeReview,
            'options' => null,
            'answer' => ['issues' => []],
        ]);
        PracticeQuestionReport::factory()->for($published, 'question')->create();
        PracticeQuestionReport::factory()->for($python, 'question')->resolved()->create();

        $ids = fn (string $query) => array_column($this->getJson('/api/admin/practice/questions'.$query)->assertOk()->json('questions'), 'id');

        $this->assertEqualsCanonicalizing([$draft->id, $published->id, $python->id, $seed->id, $review->id], $ids(''));
        $this->assertSame([$review->id], $ids('?kind=code_review'));
        $this->assertSame([$draft->id], $ids('?status=draft'));
        $this->assertEqualsCanonicalizing([$draft->id, $published->id, $seed->id], $ids('?kind=quiz&language=javascript'));
        // Every kind unless one is named: the code review question is JavaScript too.
        $this->assertEqualsCanonicalizing([$published->id, $seed->id, $review->id], $ids('?language=javascript&topic=scope'));
        $this->assertSame([$seed->id], $ids('?source=seed'));
        $this->assertSame([$published->id], $ids('?reported=1'));
    }

    public function test_reported_questions_come_first(): void
    {
        $this->actingAsAdmin();
        $quiet = PracticeQuestion::factory()->create();
        $reported = PracticeQuestion::factory()->create();
        $newest = PracticeQuestion::factory()->create();
        PracticeQuestionReport::factory()->for($reported, 'question')->create();

        $ids = array_column($this->getJson('/api/admin/practice/questions')->json('questions'), 'id');

        $this->assertSame([$reported->id, $newest->id, $quiet->id], $ids);
    }

    public function test_it_rejects_filters_it_does_not_know(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/admin/practice/questions?kind=essay')->assertUnprocessable()->assertJsonValidationErrors('kind');
        $this->getJson('/api/admin/practice/questions?status=archived')->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->getJson('/api/admin/practice/questions?language=cobol')->assertUnprocessable()->assertJsonValidationErrors('language');
        $this->getJson('/api/admin/practice/questions?source=user')->assertUnprocessable()->assertJsonValidationErrors('source');
    }

    public function test_the_list_is_paged(): void
    {
        $this->actingAsAdmin();
        PracticeQuestion::factory()->count(30)->create();

        $this->getJson('/api/admin/practice/questions')
            ->assertJsonCount(25, 'questions')
            ->assertJsonPath('meta.total', 30)
            ->assertJsonPath('meta.lastPage', 2);
        $this->getJson('/api/admin/practice/questions?page=2')->assertJsonCount(5, 'questions');
    }

    public function test_an_admin_edits_a_draft_and_publishes_it_and_users_are_served_it(): void
    {
        $this->actingAsAdmin();
        $draft = $this->aiDraft(['topic' => 'scope']);

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'prompt' => 'What does this log?',
            'code' => "console.log(y);\nvar y = 1;",
            'options' => ['1', 'undefined', 'ReferenceError', 'TypeError'],
            'answer' => ['choice' => 'undefined'],
            'explanation' => 'var y is hoisted.',
            'difficulty' => 'easy',
        ])
            ->assertOk()
            ->assertJsonPath('question.prompt', 'What does this log?')
            ->assertJsonPath('question.status', 'draft');

        $draft->refresh();
        $this->assertSame(['1', 'undefined', 'ReferenceError', 'TypeError'], $draft->options);
        $this->assertSame('easy', $draft->difficulty);
        // An edited draft is still the AI's: source says who first wrote it.
        $this->assertSame(PracticeQuestionSource::Ai, $draft->source);

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('question.status', 'published');

        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/practice/quiz/rounds', ['language' => 'javascript', 'topic' => 'scope'])
            ->assertJsonPath('questions.0.id', $draft->id);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badEdits(): array
    {
        return [
            'a key that is not an option' => [['answer' => ['choice' => 'NaN']], 'answer'],
            'options without the key' => [['options' => ['1', '2', '3', '4']], 'answer'],
            'three options' => [['options' => ['5', 'undefined', 'null']], 'options'],
            'a snippet over 40 lines' => [['code' => implode("\n", array_fill(0, 41, 'f();'))], 'code'],
            'a topic from another language' => [['topic' => 'joins'], 'topic'],
            'a language whose topics do not include this one' => [['language' => 'python'], 'topic'],
            'no explanation' => [['explanation' => ''], 'explanation'],
            'an unknown status' => [['status' => 'archived'], 'status'],
            'options that are not a list' => [['options' => 'a, b'], 'options'],
        ];
    }

    /** @param  array<string, mixed>  $edit */
    #[DataProvider('badEdits')]
    public function test_every_save_runs_the_same_checks_as_a_draft(array $edit, string $field): void
    {
        $this->actingAsAdmin();
        $draft = $this->aiDraft();
        $before = $draft->fresh()->getAttributes();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", $edit)
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertSame($before, $draft->fresh()->getAttributes());
    }

    public function test_publishing_checks_the_question_too(): void
    {
        $this->actingAsAdmin();
        // Broken before the validator existed, or by hand in the database.
        $broken = $this->aiDraft(['answer' => ['choice' => 'not one of them']]);

        $this->patchJson("/api/admin/practice/questions/{$broken->id}", ['status' => 'published'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('answer');

        $this->assertSame(PracticeQuestionStatus::Draft, $broken->fresh()->status);
    }

    public function test_an_admin_unpublishes_a_question_and_it_stops_being_served(): void
    {
        $this->actingAsAdmin();
        $question = PracticeQuestion::factory()->create();

        $this->patchJson("/api/admin/practice/questions/{$question->id}", ['status' => 'draft'])
            ->assertOk()
            ->assertJsonPath('question.status', 'draft');

        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/practice/quiz/answers', ['questionId' => $question->id, 'choice' => $question->options[0]])
            ->assertNotFound();
    }

    public function test_kind_source_and_external_id_are_not_editable(): void
    {
        $this->actingAsAdmin();
        $draft = $this->aiDraft();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'kind' => 'code_review',
            'source' => 'admin',
            'externalId' => 'quiz-js-scope-99',
            'external_id' => 'quiz-js-scope-99',
        ])->assertOk();

        $draft->refresh();
        $this->assertSame(PracticeKind::Quiz, $draft->kind);
        $this->assertSame(PracticeQuestionSource::Ai, $draft->source);
        $this->assertNull($draft->external_id);
    }

    public function test_seed_rows_are_read_only_here_because_the_sync_would_put_the_file_back(): void
    {
        $this->actingAsAdmin();
        $seed = PracticeQuestion::factory()->seeded('quiz-js-scope-01')->create();
        $before = $seed->fresh()->getAttributes();

        $edit = $this->patchJson("/api/admin/practice/questions/{$seed->id}", ['prompt' => 'Better wording'])
            ->assertUnprocessable();
        $this->assertStringContainsString('quiz-js-scope-01', $edit->json('message'));
        $this->assertStringContainsString('resources/practice', $edit->json('message'));

        $this->patchJson("/api/admin/practice/questions/{$seed->id}", ['status' => 'draft'])->assertUnprocessable();
        $this->deleteJson("/api/admin/practice/questions/{$seed->id}")->assertUnprocessable();

        $this->assertSame($before, $seed->fresh()->getAttributes());
    }

    public function test_a_question_nobody_has_answered_is_deleted(): void
    {
        $this->actingAsAdmin();
        $draft = $this->aiDraft();
        PracticeQuestionReport::factory()->for($draft, 'question')->create();

        $this->deleteJson("/api/admin/practice/questions/{$draft->id}")
            ->assertOk()
            ->assertExactJson(['deleted' => true, 'question' => null]);

        $this->assertNull($draft->fresh());
        $this->assertSame(0, PracticeQuestionReport::count());
    }

    public function test_deleting_a_question_that_has_attempts_unpublishes_it_instead(): void
    {
        $this->actingAsAdmin();
        $question = PracticeQuestion::factory()->create();
        PracticeAttempt::factory()->for($question, 'question')->create();

        $this->deleteJson("/api/admin/practice/questions/{$question->id}")
            ->assertOk()
            ->assertJsonPath('deleted', false)
            ->assertJsonPath('question.status', 'draft')
            ->assertJsonPath('question.attemptCount', 1);

        $this->assertSame(PracticeQuestionStatus::Draft, $question->fresh()->status);
        $this->assertSame(1, PracticeAttempt::count());
    }

    public function test_resolving_clears_the_open_reports_even_on_a_seed_row(): void
    {
        $this->actingAsAdmin();
        $seed = PracticeQuestion::factory()->seeded('quiz-js-scope-01')->create();
        PracticeQuestionReport::factory()->for($seed, 'question')->count(2)->create();

        $this->postJson("/api/admin/practice/questions/{$seed->id}/reports/resolve")
            ->assertOk()
            ->assertJsonPath('question.openReports', 0)
            ->assertJsonCount(0, 'question.reports');

        $this->assertSame(0, PracticeQuestionReport::whereNull('resolved_at')->count());
        $this->assertSame(2, PracticeQuestionReport::count());
        $this->getJson('/api/admin/practice/questions?reported=1')->assertJsonCount(0, 'questions');
    }

    public function test_a_kind_with_no_validator_yet_cannot_be_edited(): void
    {
        $this->actingAsAdmin();
        $review = PracticeQuestion::factory()->draft()->create([
            'kind' => PracticeKind::SystemDesign,
            'language' => null,
            'options' => null,
            'answer' => ['keyPoints' => []],
        ]);

        $response = $this->patchJson("/api/admin/practice/questions/{$review->id}", ['status' => 'published'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('kind');

        $this->assertStringContainsString('system design', $response->json('errors.kind.0'));
        $this->assertSame(PracticeQuestionStatus::Draft, $review->fresh()->status);
    }

    public function test_an_unknown_question_is_a_404(): void
    {
        $this->actingAsAdmin();

        $this->patchJson('/api/admin/practice/questions/999', ['status' => 'draft'])->assertNotFound();
        $this->deleteJson('/api/admin/practice/questions/999')->assertNotFound();
        $this->postJson('/api/admin/practice/questions/999/reports/resolve')->assertNotFound();
    }
}
