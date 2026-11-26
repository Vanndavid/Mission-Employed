<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Services\Practice\SeedBank;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * `practice:sync` ships the hand-written bank with a deploy: the container
 * runs it after migrating, on every boot. It upserts seed questions by their
 * stable id, never touches a question an admin or the AI wrote, and running
 * it again changes nothing.
 */
class PracticeSyncCommandTest extends TestCase
{
    use RefreshDatabase;

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = sys_get_temp_dir().'/practice-seed-'.bin2hex(random_bytes(6));
        File::ensureDirectoryExists($this->root.'/quiz');
        $this->app->instance(SeedBank::class, new SeedBank($this->root));
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);

        parent::tearDown();
    }

    /** @param  list<array<string, mixed>>  $questions */
    private function writeQuiz(string $language, array $questions): void
    {
        File::put("{$this->root}/quiz/{$language}.json", json_encode([
            'language' => $language,
            'questions' => $questions,
        ]));
    }

    /** @return array<string, mixed> */
    private function seedQuestion(string $id, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'topic' => 'types',
            'difficulty' => 'easy',
            'prompt' => 'What does this print?',
            'code' => 'console.log(typeof null);',
            'options' => ['object', 'null', 'undefined', 'number'],
            'answer' => 'object',
            'explanation' => 'typeof null is "object", a mistake kept for compatibility.',
        ], $overrides);
    }

    public function test_it_adds_the_bank_as_published_seed_questions(): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01')]);
        $this->writeQuiz('python', [$this->seedQuestion('quiz-py-types-01', [
            'code' => null,
            'prompt' => 'Which of these is immutable?',
            'options' => ['tuple', 'list', 'dict', 'set'],
            'answer' => 'tuple',
        ])]);

        $this->artisan('practice:sync')->assertSuccessful();

        $this->assertSame(2, PracticeQuestion::count());
        $js = PracticeQuestion::query()->where('external_id', 'quiz-js-types-01')->sole();
        $this->assertSame(PracticeKind::Quiz, $js->kind);
        $this->assertSame(PracticeLanguage::JavaScript, $js->language);
        $this->assertSame(PracticeQuestionStatus::Published, $js->status);
        $this->assertSame(PracticeQuestionSource::Seed, $js->source);
        $this->assertSame('types', $js->topic);
        $this->assertSame('easy', $js->difficulty);
        $this->assertSame('console.log(typeof null);', $js->code);
        $this->assertSame(['object', 'null', 'undefined', 'number'], $js->options);
        $this->assertSame(['choice' => 'object'], $js->answer);

        $py = PracticeQuestion::query()->where('external_id', 'quiz-py-types-01')->sole();
        $this->assertNull($py->code);
        $this->assertSame(PracticeLanguage::Python, $py->language);
    }

    public function test_running_it_twice_changes_nothing(): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-02', ['prompt' => 'Again?'])]);

        $this->artisan('practice:sync')->assertSuccessful();
        $before = PracticeQuestion::query()->orderBy('id')->get()->toArray();

        $this->travel(1)->hours();
        $this->artisan('practice:sync')
            ->expectsOutputToContain('0 added, 0 updated, 0 retired')
            ->assertSuccessful();

        $this->assertSame($before, PracticeQuestion::query()->orderBy('id')->get()->toArray());
    }

    public function test_an_edited_seed_question_is_updated_in_place(): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01')]);
        $this->artisan('practice:sync')->assertSuccessful();
        $id = PracticeQuestion::sole()->id;

        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01', [
            'explanation' => 'A clearer explanation of why typeof null is "object".',
            'difficulty' => 'medium',
        ])]);
        $this->artisan('practice:sync')
            ->expectsOutputToContain('0 added, 1 updated, 0 retired')
            ->assertSuccessful();

        $question = PracticeQuestion::sole();
        $this->assertSame($id, $question->id);
        $this->assertSame('medium', $question->difficulty);
        $this->assertStringStartsWith('A clearer explanation', $question->explanation);
    }

    public function test_it_never_touches_a_question_an_admin_or_the_ai_wrote(): void
    {
        // An admin who edits a seeded question takes it over: its source
        // changes and the file no longer wins.
        $takenOver = PracticeQuestion::factory()->create([
            'external_id' => 'quiz-js-types-01',
            'source' => PracticeQuestionSource::Admin,
            'prompt' => 'Edited by an admin',
            'status' => PracticeQuestionStatus::Draft,
        ]);
        $drafted = PracticeQuestion::factory()->create([
            'source' => PracticeQuestionSource::Ai,
            'status' => PracticeQuestionStatus::Draft,
        ]);
        $before = [$takenOver->fresh()->toArray(), $drafted->fresh()->toArray()];

        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-02')]);
        $this->artisan('practice:sync')->assertSuccessful();

        $this->assertSame($before, [$takenOver->fresh()->toArray(), $drafted->fresh()->toArray()]);
        $this->assertSame(1, PracticeQuestion::query()->where('source', PracticeQuestionSource::Seed)->count());
    }

    public function test_a_seed_question_taken_out_of_the_bank_goes_back_to_draft(): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-02')]);
        $this->artisan('practice:sync')->assertSuccessful();

        // Pulled, say for a wrong key. Its attempts keep their question, so
        // it is unpublished rather than deleted.
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01')]);
        $this->artisan('practice:sync')
            ->expectsOutputToContain('0 added, 0 updated, 1 retired')
            ->assertSuccessful();

        $this->assertSame(PracticeQuestionStatus::Published, PracticeQuestion::query()->where('external_id', 'quiz-js-types-01')->sole()->status);
        $this->assertSame(PracticeQuestionStatus::Draft, PracticeQuestion::query()->where('external_id', 'quiz-js-types-02')->sole()->status);

        // Put back, it is published again.
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-02')]);
        $this->artisan('practice:sync')->expectsOutputToContain('0 added, 1 updated, 0 retired')->assertSuccessful();
        $this->assertSame(0, PracticeQuestion::query()->where('status', PracticeQuestionStatus::Draft)->count());
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function brokenQuestions(): array
    {
        return [
            'answer not an option' => [['answer' => 'boolean']],
            'three options' => [['options' => ['object', 'null', 'undefined']]],
            'repeated option' => [['options' => ['object', 'Object', 'undefined', 'number']]],
            'empty option' => [['options' => ['object', ' ', 'undefined', 'number']]],
            'unknown topic' => [['topic' => 'joins']],
            'unknown difficulty' => [['difficulty' => 'brutal']],
            'no explanation' => [['explanation' => '']],
            'no prompt' => [['prompt' => '  ']],
        ];
    }

    /** @param  array<string, mixed>  $broken */
    #[DataProvider('brokenQuestions')]
    public function test_a_broken_question_fails_the_sync_and_writes_nothing(array $broken): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-02', $broken)]);

        $this->artisan('practice:sync')
            ->expectsOutputToContain('quiz-js-types-02')
            ->assertFailed();

        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_a_repeated_id_or_unknown_language_fails_the_sync(): void
    {
        $this->writeQuiz('javascript', [$this->seedQuestion('quiz-js-types-01'), $this->seedQuestion('quiz-js-types-01')]);
        $this->artisan('practice:sync')->assertFailed();

        File::delete("{$this->root}/quiz/javascript.json");
        $this->writeQuiz('cobol', [$this->seedQuestion('quiz-cb-types-01')]);
        $this->artisan('practice:sync')->assertFailed();

        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_the_shipped_bank_syncs_cleanly(): void
    {
        $this->app->forgetInstance(SeedBank::class);

        $this->artisan('practice:sync')->assertSuccessful();

        foreach (PracticeLanguage::cases() as $language) {
            $this->assertGreaterThanOrEqual(30, PracticeQuestion::query()
                ->where('language', $language)
                ->where('status', PracticeQuestionStatus::Published)
                ->where('source', PracticeQuestionSource::Seed)
                ->count(), $language->value);
        }
    }
}
