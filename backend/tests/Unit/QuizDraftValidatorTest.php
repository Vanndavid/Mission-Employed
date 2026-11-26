<?php

namespace Tests\Unit;

use App\Services\Practice\QuizDraftValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The checks every quiz question passes before it is saved, whether the AI
 * drafted it or an admin edited it. A wrong key is the worst bug the quiz can
 * have, so the shape that makes one likely is refused in code.
 */
class QuizDraftValidatorTest extends TestCase
{
    private QuizDraftValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->validator = new QuizDraftValidator;
    }

    /** @return array<string, mixed> */
    private function question(array $overrides = []): array
    {
        return [
            'language' => 'javascript',
            'topic' => 'scope',
            'difficulty' => 'medium',
            'prompt' => 'What does this print?',
            'code' => "console.log(x);\nvar x = 5;",
            'options' => ['5', 'undefined', 'ReferenceError', 'null'],
            'answer' => ['choice' => 'undefined'],
            'explanation' => 'var is hoisted and starts as undefined.',
            'review_notes' => null,
            ...$overrides,
        ];
    }

    /** @return array<string, string> */
    private function errorsFor(array $overrides, array $expected = []): array
    {
        return $this->validator->errors($this->validator->normalize($this->question($overrides)), $expected);
    }

    public function test_a_well_formed_question_has_no_errors(): void
    {
        $this->assertSame([], $this->errorsFor([]));
        $this->assertSame([], $this->errorsFor(['code' => null]));
    }

    /** @return array<string, array{array<string, mixed>, string, string}> */
    public static function broken(): array
    {
        $tooLong = implode("\n", array_map(fn (int $i) => "line({$i});", range(1, 41)));

        return [
            'three options' => [['options' => ['a', 'b', 'c']], 'options', 'exactly four'],
            'five options' => [['options' => ['a', 'b', 'c', 'd', 'e']], 'options', 'exactly four'],
            'a blank option' => [['options' => ['5', ' ', 'undefined', 'null']], 'options', 'non-empty'],
            'options that repeat, ignoring case' => [['options' => ['null', 'undefined', 'NULL', '5']], 'options', 'different'],
            'options that are not a list' => [['options' => 'a, b, c, d'], 'options', 'exactly four'],
            'an answer that is not an option' => [['answer' => ['choice' => 'ReferenceError: x']], 'answer', 'one of the options'],
            'no answer' => [['answer' => []], 'answer', 'one of the options'],
            'no explanation' => [['explanation' => '  '], 'explanation', 'explanation'],
            'no prompt' => [['prompt' => ''], 'prompt', 'prompt'],
            'a snippet over 40 lines' => [['code' => $tooLong], 'code', '40 lines'],
            'an unknown language' => [['language' => 'cobol'], 'language', 'javascript'],
            'a topic from another language' => [['topic' => 'joins'], 'topic', 'scope'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty', 'easy'],
            'an option too long to answer with' => [['options' => ['5', str_repeat('u', 501), 'ReferenceError', 'null']], 'options', '500'],
        ];
    }

    #[DataProvider('broken')]
    public function test_it_names_what_is_wrong(array $overrides, string $field, string $needle): void
    {
        $errors = $this->errorsFor($overrides);

        $this->assertArrayHasKey($field, $errors, 'Errors: '.json_encode($errors));
        $this->assertStringContainsString($needle, $errors[$field]);
    }

    public function test_a_snippet_of_exactly_40_lines_is_fine(): void
    {
        $code = implode("\n", array_map(fn (int $i) => "line({$i});", range(1, 40)));

        $this->assertSame([], $this->errorsFor(['code' => $code]));
    }

    public function test_a_draft_must_match_the_language_and_topic_it_was_asked_for(): void
    {
        $expected = ['language' => 'javascript', 'topic' => 'scope'];

        $this->assertSame([], $this->errorsFor([], $expected));

        $wrongLanguage = $this->errorsFor(['language' => 'python', 'topic' => 'types'], $expected);
        $this->assertStringContainsString('javascript', $wrongLanguage['language']);

        $wrongTopic = $this->errorsFor(['topic' => 'async'], $expected);
        $this->assertStringContainsString('scope', $wrongTopic['topic']);
    }

    public function test_it_tidies_text_without_touching_indentation(): void
    {
        $normalized = $this->validator->normalize($this->question([
            'prompt' => "  What does this print?\n",
            'code' => "```javascript\r\n\r\nfunction f() {\r\n    return 1;   \r\n}\r\n```\r\n",
            'options' => [' 5', 'undefined ', 'ReferenceError', 'null'],
            'answer' => ['choice' => ' undefined'],
            'explanation' => "  var is hoisted.  \n",
        ]));

        $this->assertSame('What does this print?', $normalized['prompt']);
        $this->assertSame("function f() {\n    return 1;\n}", $normalized['code']);
        $this->assertSame(['5', 'undefined', 'ReferenceError', 'null'], $normalized['options']);
        $this->assertSame(['choice' => 'undefined'], $normalized['answer']);
        $this->assertSame('var is hoisted.', $normalized['explanation']);
    }

    public function test_an_empty_snippet_is_no_snippet(): void
    {
        $this->assertNull($this->validator->normalize($this->question(['code' => " \n "]))['code']);
        $this->assertNull($this->validator->normalize($this->question(['code' => 42]))['code']);
    }

    public function test_odd_values_become_blanks_the_errors_can_name(): void
    {
        $normalized = $this->validator->normalize([
            'language' => ['javascript'],
            'prompt' => 12,
            'options' => [1, null, 'a', ['b']],
            'answer' => 'a',
        ]);

        $this->assertNull($normalized['language']);
        $this->assertSame('12', $normalized['prompt']);
        $this->assertSame(['1', '', 'a', ''], $normalized['options']);
        // Only {"choice": "..."} is a quiz key.
        $this->assertSame(['choice' => null], $normalized['answer']);
        $this->assertNotSame([], $this->validator->errors($normalized));
    }

    public function test_review_notes_keep_only_lines_about_one_of_the_options(): void
    {
        $normalized = $this->validator->normalize($this->question([
            'review_notes' => ['distractors' => [
                ['option' => ' 5', 'why' => ' The log runs before the assignment. '],
                ['option' => 'not an option', 'why' => 'Dropped.'],
                ['option' => '5', 'why' => 'A second note on the same option is dropped.'],
                ['option' => 'null', 'why' => ''],
                'not a note',
                ['option' => 'ReferenceError', 'why' => str_repeat('x', 600)],
            ]],
        ]));

        $notes = $normalized['review_notes']['distractors'];
        $this->assertSame([['option' => '5', 'why' => 'The log runs before the assignment.']], array_slice($notes, 0, 1));
        $this->assertSame('ReferenceError', $notes[1]['option']);
        $this->assertSame(QuizDraftValidator::MAX_NOTE_LENGTH, mb_strlen($notes[1]['why']));
        $this->assertCount(2, $notes);
    }

    public function test_no_usable_notes_is_null(): void
    {
        $this->assertNull($this->validator->normalize($this->question(['review_notes' => ['distractors' => []]]))['review_notes']);
        $this->assertNull($this->validator->normalize($this->question(['review_notes' => 'nonsense']))['review_notes']);
    }
}
