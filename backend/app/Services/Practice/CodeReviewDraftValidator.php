<?php

namespace App\Services\Practice;

use App\Enums\PracticeLanguage;

/**
 * The question bank's checks for a code review snippet: an AI draft on the
 * way in ({@see CodeReviewDrafts}), and every admin edit or publish after
 * it. The rules are {@see CodeReviewItemValidator}'s, the seed files' own,
 * so a generated snippet is held to the hand-written standard. This maps the
 * bank's columns onto its item (the title is `topic`, the planted issues are
 * `answer.issues`), checks the language, which the item rules leave to the
 * seed file, and files each message under the field an admin fixes.
 *
 * normalize() tidies without moving a line, because a planted issue's range
 * is read against the code exactly as the viewer numbers it
 * ({@see CodeReviewItemValidator::lines()}): Windows line ends and trailing
 * spaces go, and so do blank lines at the end and a Markdown fence around the
 * whole snippet; blank lines at the top stay, since dropping them would shift
 * every range. Odd types become blanks the checks name: "12" and 12.0 are
 * read as line 12, and anything else that is not a whole number as no line.
 * Once a question passes, its `answer` is {@see CodeReviewItemValidator::answer()},
 * exactly what a seed file stores.
 */
final class CodeReviewDraftValidator implements DraftValidator
{
    /** Which field each of CodeReviewItemValidator's messages is about, by how it starts. */
    private const FIELDS = [
        'needs a title' => 'topic',
        'difficulty' => 'difficulty',
        'needs a prompt' => 'prompt',
        'needs an explanation' => 'explanation',
        'needs the code' => 'code',
        'code ' => 'code',
        'needs a list of' => 'answer',
        'issue #' => 'answer',
    ];

    public function __construct(private readonly CodeReviewItemValidator $items = new CodeReviewItemValidator) {}

    public function normalize(array $question): array
    {
        $answer = $question['answer'] ?? null;

        $normalized = [
            'language' => DraftFields::key($question['language'] ?? null),
            'topic' => DraftFields::text($question['topic'] ?? null),
            'difficulty' => DraftFields::key($question['difficulty'] ?? null),
            'prompt' => DraftFields::text($question['prompt'] ?? null),
            'code' => self::code($question['code'] ?? null),
            'options' => null,
            'answer' => ['issues' => self::issues(is_array($answer) ? ($answer['issues'] ?? null) : null)],
            'explanation' => DraftFields::text($question['explanation'] ?? null),
            'review_notes' => null,
        ];

        $item = self::item($normalized);
        if ($this->items->errors($item) === []) {
            $normalized['answer'] = $this->items->answer($item);
        }

        return $normalized;
    }

    public function errors(array $question, array $expected = []): array
    {
        $errors = [];
        $language = is_string($question['language'] ?? null) ? PracticeLanguage::tryFrom($question['language']) : null;

        if ($language === null) {
            $errors['language'] = 'The language must be one of '.implode(', ', PracticeLanguage::values()).'.';
        } elseif (isset($expected['language']) && $language->value !== $expected['language']) {
            $errors['language'] = "This was asked for {$expected['language']} but is in {$language->value}.";
        }

        return DraftFields::keyed($this->items->errors(self::item($question)), self::FIELDS, $errors);
    }

    /**
     * The item CodeReviewItemValidator reads, from the bank's columns.
     *
     * @param  array<string, mixed>  $question
     * @return array<string, mixed>
     */
    private static function item(array $question): array
    {
        return [
            'title' => $question['topic'] ?? null,
            'difficulty' => $question['difficulty'] ?? null,
            'prompt' => $question['prompt'] ?? null,
            'code' => $question['code'] ?? null,
            'issues' => $question['answer']['issues'] ?? null,
            'explanation' => $question['explanation'] ?? null,
        ];
    }

    /**
     * Unix line ends, no trailing spaces, no blank lines at the end and no
     * Markdown fence around it. Every remaining line keeps its number.
     */
    private static function code(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $lines = array_map(fn (string $line) => rtrim($line, " \t"), explode("\n", str_replace("\r\n", "\n", $value)));
        $lines = self::withoutBlankEnd($lines);

        if (count($lines) >= 2 && preg_match('/^```[\w+#.-]*$/', trim($lines[0])) === 1 && trim(end($lines)) === '```') {
            $lines = self::withoutBlankEnd(array_slice($lines, 1, -1));
        }

        return $lines === [] ? null : implode("\n", $lines);
    }

    /**
     * @param  list<string>  $lines
     * @return list<string>
     */
    private static function withoutBlankEnd(array $lines): array
    {
        while ($lines !== [] && end($lines) === '') {
            array_pop($lines);
        }

        return array_values($lines);
    }

    /**
     * Each planted issue with only the fields a key has, typed; an entry that
     * is not an object stays null for the checks to name.
     *
     * @return list<array<string, mixed>|null>|null
     */
    private static function issues(mixed $value): ?array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            return null;
        }

        return array_map(fn (mixed $issue) => is_array($issue) ? [
            'id' => DraftFields::key($issue['id'] ?? null),
            'lines' => self::range($issue['lines'] ?? null),
            'category' => ($category = DraftFields::key($issue['category'] ?? null)) === null ? null : mb_strtolower($category),
            'severity' => self::whole($issue['severity'] ?? null),
            'summary' => DraftFields::text($issue['summary'] ?? null),
            'fix' => DraftFields::text($issue['fix'] ?? null),
        ] : null, $value);
    }

    /**
     * [start, end] as whole numbers; one number is a one-line range.
     *
     * @return array{int, int}|null
     */
    private static function range(mixed $value): ?array
    {
        $line = self::whole($value);
        if ($line !== null) {
            return [$line, $line];
        }

        if (! is_array($value) || ! array_is_list($value) || count($value) !== 2) {
            return null;
        }

        [$start, $end] = [self::whole($value[0]), self::whole($value[1])];

        return $start === null || $end === null ? null : [$start, $end];
    }

    private static function whole(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) < 1e9) {
            return (int) $value;
        }
        if (is_string($value) && preg_match('/^\s*-?\d{1,9}\s*$/', $value) === 1) {
            return (int) trim($value);
        }

        return null;
    }
}
