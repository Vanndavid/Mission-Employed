<?php

namespace App\Enums;

/**
 * Whether users can be served a question. A draft is a 404 everywhere a user
 * can reach: never in a round, a catalog count, progress or an answer.
 */
enum PracticeQuestionStatus: string
{
    case Draft = 'draft';
    case Published = 'published';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
