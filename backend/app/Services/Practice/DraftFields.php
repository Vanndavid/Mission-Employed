<?php

namespace App\Services\Practice;

use BackedEnum;

/**
 * What the code review and system design {@see DraftValidator}s share: they
 * wrap an item validator written for the seed files
 * ({@see CodeReviewItemValidator}, {@see SystemDesignItemValidator}), whose
 * messages are a flat list, and the question bank wants them per field.
 */
final class DraftFields
{
    /** A stored key such as a language or difficulty: trimmed text, or an enum's value. */
    public static function key(mixed $value): ?string
    {
        if ($value instanceof BackedEnum) {
            $value = $value->value;
        }

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /** Trimmed text; '' for anything that is not a scalar. */
    public static function text(mixed $value): string
    {
        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * An item validator's messages ("needs a title", "issue #0 (sql-injection):
     * needs a fix") as a DraftValidator's errors: each one a sentence, filed
     * under the request field an admin edits to fix it, chosen by how the
     * message starts. A field with several messages keeps every one, as
     * `answer`, `answer.1`, `answer.2`. A message no prefix claims is filed
     * under `question`.
     *
     * @param  list<string>  $messages
     * @param  array<string, string>  $fields  message prefix => field; the first match wins
     * @param  array<string, string>  $errors  errors found already, kept first
     * @return array<string, string>
     */
    public static function keyed(array $messages, array $fields, array $errors = []): array
    {
        foreach ($messages as $message) {
            $field = 'question';
            foreach ($fields as $prefix => $candidate) {
                if (str_starts_with($message, $prefix)) {
                    $field = $candidate;
                    break;
                }
            }

            $key = $field;
            for ($n = 1; isset($errors[$key]); $n++) {
                $key = "{$field}.{$n}";
            }

            $errors[$key] = self::sentence($message);
        }

        return $errors;
    }

    private static function sentence(string $message): string
    {
        $message = ucfirst(trim($message));

        return str_ends_with($message, '.') ? $message : "{$message}.";
    }
}
