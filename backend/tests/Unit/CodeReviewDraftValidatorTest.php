<?php

namespace Tests\Unit;

use App\Enums\PracticeLanguage;
use App\Services\Practice\CodeReviewDraftValidator;
use App\Services\Practice\CodeReviewItemValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The question bank's checks for a code review snippet, an AI draft or an
 * admin's edit. The rules are CodeReviewItemValidator's; this maps
 * practice_questions columns onto its item, tidies what the model or the
 * admin sent, and files each of its messages under the field to fix.
 */
class CodeReviewDraftValidatorTest extends TestCase
{
    /** @return array<string, mixed> practice_questions columns of a valid snippet */
    private static function question(array $overrides = []): array
    {
        return [
            'language' => 'javascript',
            'topic' => 'Paginate the orders',
            'difficulty' => 'medium',
            'prompt' => 'Returns one page of orders.',
            'code' => implode("\n", array_map(fn (int $n) => $n === 5 ? '' : "line {$n};", range(1, 24))),
            'answer' => ['issues' => [
                ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'Injection.', 'fix' => 'Bind it.'],
                ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 2, 'summary' => 'Off by one.', 'fix' => 'Use <=.'],
            ]],
            'explanation' => 'Start with what reaches the database.',
            ...$overrides,
        ];
    }

    private static function errors(array $question, array $expected = []): array
    {
        $validator = new CodeReviewDraftValidator;

        return $validator->errors($validator->normalize($question), $expected);
    }

    public function test_a_valid_snippet_has_no_errors_and_its_key_is_the_seed_files(): void
    {
        $validator = new CodeReviewDraftValidator;
        $question = $validator->normalize(self::question());

        $this->assertSame([], $validator->errors($question));
        $this->assertSame([], $validator->errors($question, ['language' => 'javascript']));
        $this->assertSame(
            (new CodeReviewItemValidator)->answer(['issues' => self::question()['answer']['issues']]),
            $question['answer'],
        );
        $this->assertSame(
            ['language', 'topic', 'difficulty', 'prompt', 'code', 'options', 'answer', 'explanation', 'review_notes'],
            array_keys($question),
        );
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function brokenQuestions(): array
    {
        $issue = fn (array $overrides) => ['answer' => ['issues' => [
            self::question()['answer']['issues'][0],
            [...self::question()['answer']['issues'][1], ...$overrides],
        ]]];

        return [
            'no language' => [['language' => null], 'language'],
            'an unknown language' => [['language' => 'cobol'], 'language'],
            'no title' => [['topic' => '  '], 'topic'],
            'a title too long for the bank' => [['topic' => str_repeat('x', 65)], 'topic'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
            'no prompt' => [['prompt' => null], 'prompt'],
            'no explanation' => [['explanation' => ''], 'explanation'],
            'no code' => [['code' => null], 'code'],
            'too few lines' => [['code' => 'f();'], 'code'],
            'tabs' => [['code' => str_replace('line 7;', "\tline 7;", self::question()['code'])], 'code'],
            'no issues' => [['answer' => null], 'answer'],
            'an issue that is not an object' => [['answer' => ['issues' => ['one', 'two']]], 'answer'],
            'a range past the end' => [$issue(['lines' => [24, 25]]), 'answer'],
            'a range on a blank line' => [$issue(['lines' => [5, 6]]), 'answer'],
            'a range that is not numbers' => [$issue(['lines' => ['ten', 'eleven']]), 'answer'],
            'a severity of 0' => [$issue(['severity' => 0]), 'answer'],
            'an unknown category' => [$issue(['category' => 'style']), 'answer'],
        ];
    }

    #[DataProvider('brokenQuestions')]
    public function test_each_problem_is_filed_under_the_field_to_fix(array $overrides, string $field): void
    {
        $errors = self::errors(self::question($overrides));

        $this->assertArrayHasKey($field, $errors);
        $this->assertArrayNotHasKey('question', $errors, 'Every message from the item rules has a field.');
        foreach ($errors as $message) {
            $this->assertMatchesRegularExpression('/^[A-Z].*\.$/s', $message);
        }
    }

    public function test_several_problems_with_the_issues_each_keep_their_own_message(): void
    {
        $issues = self::question()['answer']['issues'];
        $issues[0]['severity'] = 9;
        $issues[1]['fix'] = '';

        $errors = self::errors(self::question(['answer' => ['issues' => $issues]]));

        $this->assertCount(2, $errors);
        $this->assertStringContainsString('severity', $errors['answer']);
        $this->assertStringContainsString('needs a fix', $errors['answer.1']);
    }

    public function test_a_draft_must_be_in_the_language_it_was_asked_for(): void
    {
        $errors = self::errors(self::question(['language' => 'python']), ['language' => 'javascript']);

        $this->assertStringContainsString('javascript', $errors['language']);
    }

    public function test_odd_types_become_blanks_the_checks_name_and_never_throw(): void
    {
        $validator = new CodeReviewDraftValidator;

        foreach ([[], ['answer' => 'none', 'code' => 42, 'topic' => ['x']], ['answer' => ['issues' => [null, 5, ['lines' => 'a-b']]]]] as $question) {
            $normalized = $validator->normalize($question);
            $this->assertNotSame([], $validator->errors($normalized));
        }
    }

    public function test_line_numbers_and_severities_sent_as_text_are_read_as_numbers(): void
    {
        $issues = self::question()['answer']['issues'];
        $issues[1] = [...$issues[1], 'lines' => ['10', 11.0], 'severity' => '2', 'category' => 'Bug'];

        $question = (new CodeReviewDraftValidator)->normalize(self::question(['answer' => ['issues' => $issues]]));

        $this->assertSame([10, 11], $question['answer']['issues'][1]['lines']);
        $this->assertSame(2, $question['answer']['issues'][1]['severity']);
        $this->assertSame('bug', $question['answer']['issues'][1]['category']);
    }

    public function test_the_code_is_tidied_without_moving_a_line(): void
    {
        $code = self::question()['code'];
        $messy = "```js\r\n".str_replace("\n", "   \r\n", $code)."\r\n```\n\n";

        $this->assertSame($code, (new CodeReviewDraftValidator)->normalize(self::question(['code' => $messy]))['code']);
        // Blank lines at the top are kept: removing them would move every range.
        $this->assertSame("\n\n".$code, (new CodeReviewDraftValidator)->normalize(self::question(['code' => "\n\n".$code."\n"]))['code']);
    }

    public function test_the_language_may_be_an_enum(): void
    {
        $this->assertSame([], self::errors(self::question(['language' => PracticeLanguage::JavaScript])));
    }
}
