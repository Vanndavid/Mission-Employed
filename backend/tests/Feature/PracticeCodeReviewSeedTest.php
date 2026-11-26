<?php

namespace Tests\Feature;

use App\Enums\CodeReviewCategory;
use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Services\Practice\CodeReviewItemValidator;
use App\Services\Practice\SeedBank;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The hand-written code review snippets in resources/practice/code_review.
 *
 * A planted issue whose lines are off marks a right comment as a miss, so
 * the files are first read straight from disk, not through the code that
 * syncs them, and every range is checked against its own snippet. Then the
 * sync: the snippets publish as code_review questions, and one broken
 * snippet fails the whole sync.
 */
class PracticeCodeReviewSeedTest extends TestCase
{
    use RefreshDatabase;

    private const KEYS = ['id', 'title', 'difficulty', 'prompt', 'code', 'issues', 'explanation'];

    private const ISSUE_KEYS = ['id', 'lines', 'category', 'severity', 'summary', 'fix'];

    private ?string $root = null;

    protected function tearDown(): void
    {
        if ($this->root !== null) {
            File::deleteDirectory($this->root);
        }

        parent::tearDown();
    }

    /** @return array<string, array{language: string, snippets: list<array<string, mixed>>}> */
    private function files(): array
    {
        $files = [];
        foreach (glob(resource_path('practice/code_review/*.json')) as $path) {
            $data = json_decode((string) file_get_contents($path), true);
            $this->assertIsArray($data, basename($path).' is not valid JSON');
            $files[basename($path, '.json')] = $data;
        }

        return $files;
    }

    public function test_there_are_eight_to_ten_snippets_across_the_launch_languages(): void
    {
        $files = $this->files();

        $this->assertEqualsCanonicalizing(PracticeLanguage::values(), array_keys($files));

        $total = 0;
        foreach ($files as $name => $file) {
            $this->assertSame(['language', 'snippets'], array_keys($file), "{$name}.json has unexpected keys");
            $this->assertSame($name, $file['language'], "{$name}.json names another language");
            $this->assertGreaterThanOrEqual(2, count($file['snippets']), $name);
            $total += count($file['snippets']);
        }

        $this->assertGreaterThanOrEqual(8, $total);
        $this->assertLessThanOrEqual(10, $total);
    }

    public function test_every_snippet_is_well_formed_with_its_issues_inside_it(): void
    {
        $seen = [];
        $categories = [];

        foreach ($this->files() as $name => $file) {
            foreach ($file['snippets'] as $i => $snippet) {
                $where = "{$name}.json #{$i} (".($snippet['id'] ?? 'no id').')';

                $this->assertSame(self::KEYS, array_keys($snippet), "{$where} has missing, unknown or reordered fields");
                $this->assertMatchesRegularExpression('/^review-(js|py|java|sql)-[a-z0-9]+(-[a-z0-9]+)*$/', $snippet['id'], $where);
                $this->assertArrayNotHasKey($snippet['id'], $seen, "{$where} reuses an id");
                $seen[$snippet['id']] = true;

                foreach (['title', 'prompt', 'explanation'] as $field) {
                    $this->assertIsString($snippet[$field], "{$where} {$field}");
                    $this->assertNotSame('', trim($snippet[$field]), "{$where} needs a {$field}");
                }
                $this->assertLessThanOrEqual(64, mb_strlen($snippet['title']), "{$where} title is too long");
                $this->assertContains($snippet['difficulty'], PracticeQuestion::DIFFICULTIES, $where);

                // The code is a list of lines, so a range can be read off the file.
                $lines = $snippet['code'];
                $this->assertTrue(is_array($lines) && array_is_list($lines), "{$where} code must be a list of lines");
                $this->assertGreaterThanOrEqual(20, count($lines), "{$where} is under 20 lines");
                $this->assertLessThanOrEqual(80, count($lines), "{$where} is over 80 lines");
                foreach ($lines as $n => $line) {
                    $this->assertIsString($line, "{$where} line ".($n + 1));
                    $this->assertStringNotContainsString("\n", $line, "{$where} line ".($n + 1));
                    $this->assertStringNotContainsString("\t", $line, "{$where} line ".($n + 1).' has a tab');
                    $this->assertSame(rtrim($line), $line, "{$where} line ".($n + 1).' has trailing spaces');
                }
                $this->assertNotSame('', trim($lines[0]), "{$where} starts with a blank line");
                $this->assertNotSame('', trim($lines[count($lines) - 1]), "{$where} ends with a blank line");

                $issues = $snippet['issues'];
                $this->assertGreaterThanOrEqual(2, count($issues), "{$where} needs at least 2 issues");
                $this->assertLessThanOrEqual(6, count($issues), "{$where} has more than 6 issues");

                $issueIds = [];
                foreach ($issues as $j => $issue) {
                    $at = "{$where} issue #{$j} (".($issue['id'] ?? 'no id').')';

                    $this->assertSame(self::ISSUE_KEYS, array_keys($issue), "{$at} has missing, unknown or reordered fields");
                    $this->assertMatchesRegularExpression('/^[a-z0-9]+(-[a-z0-9]+)*$/', $issue['id'], $at);
                    $this->assertNotContains($issue['id'], $issueIds, "{$at} reuses an issue id");
                    $issueIds[] = $issue['id'];

                    [$start, $end] = $issue['lines'];
                    $this->assertCount(2, $issue['lines'], $at);
                    $this->assertIsInt($start, $at);
                    $this->assertIsInt($end, $at);
                    $this->assertGreaterThanOrEqual(1, $start, "{$at} starts before line 1");
                    $this->assertLessThanOrEqual($end, $start, "{$at} ends before it starts");
                    $this->assertLessThanOrEqual(count($lines), $end, "{$at} ends past the snippet's ".count($lines).' lines');
                    $this->assertNotSame('', trim($lines[$start - 1]), "{$at} starts on a blank line");
                    $this->assertNotSame('', trim($lines[$end - 1]), "{$at} ends on a blank line");

                    $this->assertContains($issue['category'], CodeReviewCategory::values(), $at);
                    $this->assertContains($issue['severity'], [1, 2, 3], "{$at} severity must be 1, 2 or 3");
                    $this->assertGreaterThan(10, mb_strlen(trim($issue['summary'])), "{$at} needs a summary");
                    $this->assertGreaterThan(10, mb_strlen(trim($issue['fix'])), "{$at} needs a fix");
                    $categories[$issue['category']] = true;
                }

                // And the rules an AI draft will be held to.
                $this->assertSame([], (new CodeReviewItemValidator)->errors([...$snippet, 'code' => implode("\n", $lines)]), $where);
            }
        }

        // Every kind of issue a review is scored on turns up somewhere.
        $this->assertEqualsCanonicalizing(CodeReviewCategory::values(), array_keys($categories));
    }

    public function test_the_shipped_snippets_sync_as_published_code_review_questions(): void
    {
        $this->artisan('practice:sync')->assertSuccessful();

        $questions = PracticeQuestion::query()->servable(PracticeKind::CodeReview)->get();
        $this->assertCount(array_sum(array_map(fn (array $f) => count($f['snippets']), $this->files())), $questions);

        $orders = $questions->firstWhere('external_id', 'review-js-orders-page');
        $this->assertSame(PracticeLanguage::JavaScript, $orders->language);
        $this->assertSame(PracticeQuestionSource::Seed, $orders->source);
        $this->assertSame(PracticeQuestionStatus::Published, $orders->status);
        $this->assertSame("One page of a user's orders", $orders->topic);
        $this->assertNull($orders->options);
        $this->assertStringStartsWith("const express = require('express');\nconst db = require('./db');\n", $orders->code);
        $this->assertSame(34, CodeReviewItemValidator::lineCount($orders->code));
        $this->assertSame(
            ['id' => 'sql-injection', 'lines' => [14, 16], 'category' => 'security', 'severity' => 3],
            array_intersect_key($orders->answer['issues'][0], array_flip(['id', 'lines', 'category', 'severity'])),
        );

        // The quiz is untouched by the new kind.
        $this->assertGreaterThan(100, PracticeQuestion::query()->servable(PracticeKind::Quiz)->count());
    }

    /** @return array<string, mixed> */
    private function snippet(array $overrides = []): array
    {
        return array_merge([
            'id' => 'review-js-sample',
            'title' => 'A sample',
            'difficulty' => 'easy',
            'prompt' => 'Adds numbers.',
            'code' => array_map(fn (int $n) => "const n{$n} = {$n};", range(1, 22)),
            'issues' => [
                ['id' => 'first', 'lines' => [2, 3], 'category' => 'bug', 'severity' => 2, 'summary' => 'Wrong.', 'fix' => 'Fix it.'],
                ['id' => 'second', 'lines' => [9, 9], 'category' => 'readability', 'severity' => 1, 'summary' => 'Unclear.', 'fix' => 'Rename it.'],
            ],
            'explanation' => 'Read it twice.',
        ], $overrides);
    }

    /** @param  list<array<string, mixed>>  $snippets */
    private function useBank(array $snippets): void
    {
        $this->root = sys_get_temp_dir().'/practice-review-seed-'.bin2hex(random_bytes(6));
        File::ensureDirectoryExists($this->root.'/code_review');
        File::put($this->root.'/code_review/javascript.json', json_encode(['language' => 'javascript', 'snippets' => $snippets]));
        $this->app->instance(SeedBank::class, new SeedBank($this->root));
    }

    public function test_a_snippet_in_the_seed_format_is_published_with_its_issues_as_the_key(): void
    {
        $this->useBank([$this->snippet()]);

        $this->artisan('practice:sync')->expectsOutputToContain('1 added')->assertSuccessful();

        $question = PracticeQuestion::sole();
        $this->assertSame(PracticeKind::CodeReview, $question->kind);
        $this->assertSame('A sample', $question->topic);
        $this->assertSame(22, CodeReviewItemValidator::lineCount($question->code));
        $this->assertSame('Read it twice.', $question->explanation);
        $this->assertSame(['issues' => [
            ['id' => 'first', 'lines' => [2, 3], 'category' => 'bug', 'severity' => 2, 'summary' => 'Wrong.', 'fix' => 'Fix it.'],
            ['id' => 'second', 'lines' => [9, 9], 'category' => 'readability', 'severity' => 1, 'summary' => 'Unclear.', 'fix' => 'Rename it.'],
        ]], $question->answer);

        // A second run changes nothing.
        $this->artisan('practice:sync')->expectsOutputToContain('0 added, 0 updated, 0 retired')->assertSuccessful();
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function brokenSnippets(): array
    {
        $issue = fn (array $overrides) => ['issues' => [
            ['id' => 'first', 'lines' => [2, 3], 'category' => 'bug', 'severity' => 2, 'summary' => 'Wrong.', 'fix' => 'Fix it.'],
            ['id' => 'second', 'lines' => [9, 9], 'category' => 'readability', 'severity' => 1, 'summary' => 'Unclear.', 'fix' => 'Rename it.', ...$overrides],
        ]];

        return [
            'a range past the end' => [$issue(['lines' => [21, 23]])],
            'a repeated issue id' => [$issue(['id' => 'first'])],
            'no fix' => [$issue(['fix' => ''])],
            'a severity of 5' => [$issue(['severity' => 5])],
            'an unknown category' => [$issue(['category' => 'style'])],
            'code that is not a list of lines' => [['code' => 'const a = 1;']],
            'too short' => [['code' => ['const a = 1;', 'const b = 2;']]],
        ];
    }

    /** @param  array<string, mixed>  $broken */
    #[DataProvider('brokenSnippets')]
    public function test_a_broken_snippet_fails_the_sync_and_writes_nothing(array $broken): void
    {
        $this->useBank([$this->snippet(['id' => 'review-js-good']), $this->snippet(['id' => 'review-js-broken', ...$broken])]);

        $this->artisan('practice:sync')
            ->expectsOutputToContain('review-js-broken')
            ->assertFailed();

        $this->assertSame(0, PracticeQuestion::count());
    }
}
