<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Services\Practice\SeedBank;
use App\Services\Practice\SystemDesignItemValidator;
use App\Services\Practice\SystemDesignRubric;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * `practice:sync` publishes hand-written system design scenarios from
 * resources/practice/system_design, one scenario a file, with the same
 * well-formedness rules ({@see SystemDesignItemValidator}) an AI draft will
 * have to pass.
 */
class PracticeSystemDesignSeedTest extends TestCase
{
    use RefreshDatabase;

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = sys_get_temp_dir().'/practice-sd-seed-'.bin2hex(random_bytes(6));
        File::ensureDirectoryExists($this->root.'/system_design');
        $this->app->instance(SeedBank::class, new SeedBank($this->root));
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);

        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private static function scenario(array $overrides = []): array
    {
        return array_merge([
            'id' => 'sd-url-shortener',
            'title' => 'URL shortener',
            'difficulty' => 'easy',
            'prompt' => 'Design a URL shortener for 100 million new links a month, with ten redirects for every link created and links kept for five years.',
            'explanation' => 'A read-heavy key-value problem: generate codes that never collide and serve redirects from a cache.',
            'keyPoints' => [
                'requirements' => ['Separates creating a link from following one', 'Puts a number on redirect latency'],
                'estimation' => ['About 40 new links a second', 'About 3 TB over five years'],
                'api_data_model' => ['POST to create, GET to redirect', 'Links keyed by short code'],
                'architecture' => ['Separate read and write paths', 'A cache in front of the store'],
                'scalability' => ['Shard by short code', 'Cache hot redirects'],
                'reliability' => ['301 against 302', 'Replicate the store'],
                'communication' => ['Traces one redirect end to end', 'Ties the estimates to the choices'],
            ],
        ], $overrides);
    }

    private function write(string $name, array $scenario): void
    {
        File::put("{$this->root}/system_design/{$name}.json", json_encode($scenario));
    }

    public function test_a_scenario_is_published_with_its_key_points_as_the_answer(): void
    {
        $this->write('url-shortener', self::scenario());

        $this->artisan('practice:sync')->assertSuccessful();

        $question = PracticeQuestion::sole();
        $this->assertSame('sd-url-shortener', $question->external_id);
        $this->assertSame(PracticeKind::SystemDesign, $question->kind);
        $this->assertNull($question->language);
        $this->assertSame('URL shortener', $question->topic);
        $this->assertSame('easy', $question->difficulty);
        $this->assertSame(self::scenario()['prompt'], $question->prompt);
        $this->assertSame(self::scenario()['explanation'], $question->explanation);
        $this->assertNull($question->code);
        $this->assertNull($question->options);
        $this->assertSame(['keyPoints' => self::scenario()['keyPoints']], $question->answer);
        $this->assertSame(PracticeQuestionStatus::Published, $question->status);
        $this->assertSame(PracticeQuestionSource::Seed, $question->source);
    }

    public function test_key_points_are_stored_in_rubric_order_so_a_second_sync_changes_nothing(): void
    {
        $scenario = self::scenario();
        $scenario['keyPoints'] = array_reverse($scenario['keyPoints'], true);
        $this->write('url-shortener', $scenario);

        $this->artisan('practice:sync')->assertSuccessful();
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_keys(PracticeQuestion::sole()->answer['keyPoints']));

        $this->artisan('practice:sync')
            ->expectsOutputToContain('0 added, 0 updated, 0 retired')
            ->assertSuccessful();
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function malformed(): array
    {
        $keyPoints = self::scenario()['keyPoints'];

        return [
            'no id' => [self::scenario(['id' => '']), 'needs an id'],
            'no title' => [self::scenario(['title' => ' ']), 'needs a title'],
            'a title too long for the bank' => [self::scenario(['title' => str_repeat('x', 65)]), 'title'],
            'an unknown difficulty' => [self::scenario(['difficulty' => 'brutal']), 'difficulty'],
            'no scale numbers' => [self::scenario(['prompt' => 'Design a URL shortener that lots and lots of people use every single day, all over the world, all the time.']), 'scale'],
            'no explanation' => [self::scenario(['explanation' => '']), 'explanation'],
            'a trait with one key point' => [self::scenario(['keyPoints' => ['scalability' => ['Shard by short code']] + $keyPoints]), 'scalability needs at least 2 key points'],
            'a missing trait' => [self::scenario(['keyPoints' => array_diff_key($keyPoints, ['communication' => true])]), 'communication needs at least 2 key points'],
            'an unknown trait' => [self::scenario(['keyPoints' => $keyPoints + ['charisma' => ['a', 'b']]]), 'charisma is not a rubric trait'],
            'a repeated key point' => [self::scenario(['keyPoints' => ['architecture' => ['A cache', 'a cache']] + $keyPoints]), 'architecture repeats a key point'],
            'a key point that is not text' => [self::scenario(['keyPoints' => ['architecture' => ['A cache', 7]] + $keyPoints]), 'architecture'],
            'an unknown field' => [self::scenario(['language' => 'javascript']), 'unknown field language'],
        ];
    }

    #[DataProvider('malformed')]
    public function test_a_malformed_scenario_fails_the_sync_and_writes_nothing(array $scenario, string $problem): void
    {
        $this->write('good', self::scenario(['id' => 'sd-good']));
        $this->write('bad', $scenario);

        $this->artisan('practice:sync')
            ->expectsOutputToContain($problem)
            ->assertFailed();

        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_the_validator_accepts_a_well_formed_item_and_shapes_its_columns(): void
    {
        $item = self::scenario();
        unset($item['id']);

        $this->assertSame([], SystemDesignItemValidator::errors($item));

        $columns = SystemDesignItemValidator::columns($item);
        $this->assertSame(PracticeKind::SystemDesign, $columns['kind']);
        $this->assertNull($columns['language']);
        $this->assertSame('URL shortener', $columns['topic']);
        $this->assertSame(['keyPoints' => $item['keyPoints']], $columns['answer']);
    }
}
