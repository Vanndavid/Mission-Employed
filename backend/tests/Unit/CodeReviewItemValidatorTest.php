<?php

namespace Tests\Unit;

use App\Services\Practice\CodeReviewItemValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * What makes a code review snippet fit to publish, whoever wrote it: the seed
 * files now, and the admin bank's AI drafts later. A planted issue whose
 * lines are off scores a right comment as a miss, so every range is checked
 * against the snippet itself.
 */
class CodeReviewItemValidatorTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function item(array $overrides = []): array
    {
        $code = implode("\n", array_map(fn (int $n) => $n === 5 ? '' : "line {$n};", range(1, 24)));

        return array_merge([
            'title' => 'Paginate the orders',
            'difficulty' => 'medium',
            'prompt' => 'Returns one page of the signed-in user\'s orders, newest first.',
            'code' => $code,
            'issues' => [
                ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'The id is pasted into SQL.', 'fix' => 'Bind it as a parameter.'],
                ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 2, 'summary' => 'The last page is skipped.', 'fix' => 'Use <= rather than <.'],
            ],
            'explanation' => 'Start with what reaches the database.',
        ], $overrides);
    }

    /** @param  array<string, mixed>  $overrides */
    private static function withIssue(int $index, array $overrides): array
    {
        $item = self::item();
        $item['issues'][$index] = array_merge($item['issues'][$index], $overrides);

        return $item;
    }

    public function test_a_well_formed_item_has_no_errors(): void
    {
        $this->assertSame([], (new CodeReviewItemValidator)->errors(self::item()));
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function brokenItems(): array
    {
        $short = implode("\n", array_map(fn (int $n) => "line {$n};", range(1, 19)));
        $long = implode("\n", array_map(fn (int $n) => "line {$n};", range(1, 81)));
        $issue = fn (array $overrides) => self::withIssue(1, $overrides);
        $sixIssues = array_map(
            fn (int $n) => ['id' => "issue-{$n}", 'lines' => [$n, $n], 'category' => 'bug', 'severity' => 1, 'summary' => 'Wrong.', 'fix' => 'Fix it.'],
            range(1, 7),
        );

        return [
            'no title' => [self::item(['title' => ' ']), 'title'],
            'a title too long for the bank' => [self::item(['title' => str_repeat('x', 65)]), 'title'],
            'an unknown difficulty' => [self::item(['difficulty' => 'brutal']), 'difficulty'],
            'no prompt' => [self::item(['prompt' => '']), 'prompt'],
            'no explanation' => [self::item(['explanation' => null]), 'explanation'],
            'code that is not text' => [self::item(['code' => ['line 1;']]), 'code'],
            'fewer than 20 lines' => [self::item(['code' => $short]), '20 to 80 lines'],
            'more than 80 lines' => [self::item(['code' => $long]), '20 to 80 lines'],
            'tabs' => [self::item(['code' => str_replace('line 7;', "\tline 7;", self::item()['code'])]), 'tabs'],
            'one issue' => [self::item(['issues' => [self::item()['issues'][0]]]), '2 to 6 issues'],
            'seven issues' => [self::item(['issues' => $sixIssues]), '2 to 6 issues'],
            'issues not a list' => [self::item(['issues' => 'none']), '2 to 6 issues'],
            'a repeated issue id' => [$issue(['id' => 'sql-injection']), 'more than once'],
            'an issue id that is not a slug' => [$issue(['id' => 'Off By One']), 'id'],
            'a range past the end' => [$issue(['lines' => [23, 25]]), 'inside the snippet'],
            'a range before the start' => [$issue(['lines' => [0, 2]]), 'inside the snippet'],
            'a range that ends before it starts' => [$issue(['lines' => [10, 9]]), 'inside the snippet'],
            'a range that is not two numbers' => [$issue(['lines' => [10]]), 'lines'],
            'a range of strings' => [$issue(['lines' => ['10', '10']]), 'lines'],
            'a range wider than 15 lines' => [$issue(['lines' => [1, 16]]), 'at most 15'],
            'a range starting on a blank line' => [$issue(['lines' => [5, 6]]), 'blank'],
            'a range ending on a blank line' => [$issue(['lines' => [4, 5]]), 'blank'],
            'an unknown category' => [$issue(['category' => 'style']), 'category'],
            'severity 0' => [$issue(['severity' => 0]), 'severity'],
            'severity 4' => [$issue(['severity' => 4]), 'severity'],
            'severity as text' => [$issue(['severity' => '2']), 'severity'],
            'no summary' => [$issue(['summary' => '']), 'summary'],
            'no fix' => [$issue(['fix' => '  ']), 'fix'],
            'an issue that is not an object' => [self::item(['issues' => [self::item()['issues'][0], 'oops']]), 'not an object'],
        ];
    }

    /** @param  array<string, mixed>  $item */
    #[DataProvider('brokenItems')]
    public function test_a_broken_item_is_refused_with_a_reason(array $item, string $reason): void
    {
        $errors = (new CodeReviewItemValidator)->errors($item);

        $this->assertNotSame([], $errors);
        $this->assertStringContainsString($reason, implode(' | ', $errors));
    }

    public function test_the_answer_is_the_issues_in_a_fixed_shape(): void
    {
        $item = self::withIssue(0, ['summary' => '  The id is pasted into SQL.  ', 'extra' => 'dropped']);

        $this->assertSame(['issues' => [
            ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'The id is pasted into SQL.', 'fix' => 'Bind it as a parameter.'],
            ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 2, 'summary' => 'The last page is skipped.', 'fix' => 'Use <= rather than <.'],
        ]], (new CodeReviewItemValidator)->answer($item));
    }

    public function test_lines_are_counted_as_the_viewer_draws_them(): void
    {
        $this->assertSame(3, CodeReviewItemValidator::lineCount("a\n\nc"));
        // A trailing newline is not a line of its own.
        $this->assertSame(2, CodeReviewItemValidator::lineCount("a\nb\n\n"));
    }
}
