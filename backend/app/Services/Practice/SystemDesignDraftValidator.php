<?php

namespace App\Services\Practice;

/**
 * The question bank's checks for a system design scenario: an AI draft on
 * the way in ({@see SystemDesignDrafts}), and every admin edit or publish
 * after it. The rules are {@see SystemDesignItemValidator}'s, the seed
 * files' own: every rubric trait and only those, 2 to 6 distinct key points
 * each, a title that fits `topic`, and scale numbers in the prompt. This maps
 * the bank's columns onto its item (the title is `topic`, the key points are
 * `answer.keyPoints`) and files each message under the field an admin fixes.
 *
 * A scenario has no language, code or options, so normalize() always sets
 * them null. Key points are trimmed and blank ones dropped; one that is not
 * text stays null for the checks to name. Once a scenario passes, its
 * columns are {@see SystemDesignItemValidator::columns()}, key points in
 * rubric order, exactly what a seed file stores.
 */
final class SystemDesignDraftValidator implements DraftValidator
{
    /** Which field each of SystemDesignItemValidator's messages is about, by how it starts. */
    private const FIELDS = [
        'needs a title' => 'topic',
        'the title' => 'topic',
        'difficulty' => 'difficulty',
        'needs a prompt' => 'prompt',
        'the prompt' => 'prompt',
        'needs an explanation' => 'explanation',
        'keyPoints' => 'answer',
    ];

    public function normalize(array $question): array
    {
        $answer = $question['answer'] ?? null;

        $normalized = [
            'language' => null,
            'topic' => DraftFields::text($question['topic'] ?? null),
            'difficulty' => DraftFields::key($question['difficulty'] ?? null),
            'prompt' => DraftFields::text($question['prompt'] ?? null),
            'code' => null,
            'options' => null,
            'answer' => ['keyPoints' => self::keyPoints(is_array($answer) ? ($answer['keyPoints'] ?? null) : null)],
            'explanation' => DraftFields::text($question['explanation'] ?? null),
            'review_notes' => null,
        ];

        $item = self::item($normalized);
        if (SystemDesignItemValidator::errors($item) === []) {
            $columns = SystemDesignItemValidator::columns($item);
            unset($columns['kind']);
            $normalized = [...$normalized, ...$columns];
        }

        return $normalized;
    }

    public function errors(array $question, array $expected = []): array
    {
        return DraftFields::keyed(SystemDesignItemValidator::errors(self::item($question)), self::FIELDS);
    }

    /**
     * The item SystemDesignItemValidator reads, from the bank's columns.
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
            'explanation' => $question['explanation'] ?? null,
            'keyPoints' => $question['answer']['keyPoints'] ?? null,
        ];
    }

    /**
     * trait => its key points, trimmed, blanks dropped. A list where the map
     * should be is no key points; a trait whose points are not a list keeps ''.
     *
     * @return array<string, list<string|null>|string>|null
     */
    private static function keyPoints(mixed $value): ?array
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            return null;
        }

        $keyPoints = [];
        foreach ($value as $trait => $points) {
            $keyPoints[trim((string) $trait)] = is_array($points) && array_is_list($points)
                ? array_values(array_filter(
                    array_map(fn (mixed $point) => is_scalar($point) ? trim((string) $point) : null, $points),
                    fn (?string $point) => $point !== '',
                ))
                : '';
        }

        return $keyPoints;
    }
}
