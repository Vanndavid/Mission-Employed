<?php

namespace Tests\Unit;

use App\Services\Practice\SystemDesignDraftValidator;
use App\Services\Practice\SystemDesignItemValidator;
use App\Services\Practice\SystemDesignRubric;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The question bank's checks for a system design scenario, an AI draft or an
 * admin's edit. The rules are SystemDesignItemValidator's; this maps
 * practice_questions columns onto its item, tidies what came in, and files
 * each message under the field to fix.
 */
class SystemDesignDraftValidatorTest extends TestCase
{
    /** @return array<string, list<string>> */
    private static function keyPoints(array $overrides = []): array
    {
        $points = [];
        foreach (array_keys(SystemDesignRubric::TRAITS) as $trait) {
            $points[$trait] = ["First point on {$trait}", "Second point on {$trait}"];
        }

        return [...$points, ...$overrides];
    }

    /** @return array<string, mixed> practice_questions columns of a valid scenario */
    private static function question(array $overrides = []): array
    {
        return [
            'language' => null,
            'topic' => 'API rate limiter',
            'difficulty' => 'medium',
            'prompt' => 'Design a rate limiter for a public API with 20,000 customers sending 50,000 requests a second at peak.',
            'code' => null,
            'options' => null,
            'answer' => ['keyPoints' => self::keyPoints()],
            'explanation' => 'Where the counters live, and what happens when that store is slow.',
            ...$overrides,
        ];
    }

    private static function errors(array $question): array
    {
        $validator = new SystemDesignDraftValidator;

        return $validator->errors($validator->normalize($question));
    }

    public function test_a_valid_scenario_has_no_errors_and_is_stored_as_the_seed_files_are(): void
    {
        $validator = new SystemDesignDraftValidator;
        $question = $validator->normalize(self::question([
            // Out of rubric order, as an edit might send it.
            'answer' => ['keyPoints' => array_reverse(self::keyPoints(), true)],
        ]));

        $this->assertSame([], $validator->errors($question));

        $columns = SystemDesignItemValidator::columns([
            'title' => 'API rate limiter',
            'difficulty' => 'medium',
            'prompt' => self::question()['prompt'],
            'explanation' => self::question()['explanation'],
            'keyPoints' => self::keyPoints(),
        ]);
        unset($columns['kind']);
        foreach ($columns as $column => $value) {
            $this->assertSame($value, $question[$column], $column);
        }
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_keys($question['answer']['keyPoints']));
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function brokenQuestions(): array
    {
        $missing = self::keyPoints();
        unset($missing['communication']);

        return [
            'no title' => [['topic' => ''], 'topic'],
            'a title too long' => [['topic' => str_repeat('x', 65)], 'topic'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
            'no prompt' => [['prompt' => null], 'prompt'],
            'a prompt with no numbers' => [['prompt' => str_repeat('Design a system that shortens links. ', 4)], 'prompt'],
            'no explanation' => [['explanation' => 'Short.'], 'explanation'],
            'no key points' => [['answer' => null], 'answer'],
            'key points as a list' => [['answer' => ['keyPoints' => ['a', 'b']]], 'answer'],
            'a trait missing' => [['answer' => ['keyPoints' => $missing]], 'answer'],
            'a trait the rubric does not have' => [['answer' => ['keyPoints' => self::keyPoints(['security' => ['a', 'b']])]], 'answer'],
            'one key point' => [['answer' => ['keyPoints' => self::keyPoints(['scalability' => ['Only one']])]], 'answer'],
            'a key point too long' => [['answer' => ['keyPoints' => self::keyPoints(['scalability' => [str_repeat('x', 201), 'b']])]], 'answer'],
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

    public function test_key_points_are_trimmed_and_blank_ones_dropped(): void
    {
        $question = (new SystemDesignDraftValidator)->normalize(self::question([
            'answer' => ['keyPoints' => self::keyPoints(['estimation' => [' About 50,000 a second ', '', 7, ['nested']]])],
        ]));

        $this->assertSame(['About 50,000 a second', '7', null], $question['answer']['keyPoints']['estimation']);
        $this->assertNotSame([], (new SystemDesignDraftValidator)->errors($question));
    }

    public function test_only_a_scenarios_columns_are_kept(): void
    {
        $question = (new SystemDesignDraftValidator)->normalize(self::question([
            'language' => 'javascript',
            'code' => 'x',
            'options' => ['a'],
            'review_notes' => ['distractors' => []],
        ]));

        $this->assertNull($question['language']);
        $this->assertNull($question['code']);
        $this->assertNull($question['options']);
        $this->assertNull($question['review_notes']);
    }

    public function test_odd_types_become_blanks_the_checks_name_and_never_throw(): void
    {
        $validator = new SystemDesignDraftValidator;

        foreach ([[], ['answer' => 'none', 'topic' => ['x'], 'prompt' => 12], ['answer' => ['keyPoints' => ['requirements' => 'one']]]] as $question) {
            $this->assertNotSame([], $validator->errors($validator->normalize($question)));
        }
    }
}
