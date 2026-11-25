<?php

namespace App\Enums;

/**
 * The practice modes that share the question bank (practice_questions) and
 * the attempts table (practice_attempts). Mirrors PracticeKind in
 * frontend/types/practice.ts.
 *
 * Only the quiz is served so far. Code review and system design are named
 * here so the bank's `kind` column already has their values; each gets its
 * seed format in SeedBank, its routes and its scoring when it lands. Problems
 * (the AI tutor) is not a kind: it keeps coding_attempts.
 */
enum PracticeKind: string
{
    /** Multiple choice, scored in code. Free and never metered. */
    case Quiz = 'quiz';
    case CodeReview = 'code_review';
    case SystemDesign = 'system_design';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
