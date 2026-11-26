<?php

namespace App\Enums;

/**
 * What kind of problem a code review snippet's planted issue is. Stored on
 * each issue in the question's answer and copied into the attempt's
 * feedback, so progress can read a found rate per category. Mirrors
 * CodeReviewCategory in frontend/types/codeReview.ts.
 */
enum CodeReviewCategory: string
{
    case Bug = 'bug';
    case Security = 'security';
    case Performance = 'performance';
    case Concurrency = 'concurrency';
    case Readability = 'readability';
    case Testing = 'testing';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    public function label(): string
    {
        return match ($this) {
            self::Bug => 'Bug',
            self::Security => 'Security',
            self::Performance => 'Performance',
            self::Concurrency => 'Concurrency',
            self::Readability => 'Readability',
            self::Testing => 'Testing',
        };
    }
}
