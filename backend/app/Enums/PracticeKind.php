<?php

namespace App\Enums;

/**
 * The practice modes that share the question bank (practice_questions) and
 * the attempts table (practice_attempts). Mirrors PracticeKind in
 * frontend/types/practice.ts.
 *
 * Every kind is served: each has its seed format in SeedBank, its routes and
 * its scoring, and its AI drafts in Services\Practice\DraftKinds. Problems
 * (the AI tutor) is not a kind: it keeps coding_attempts.
 */
enum PracticeKind: string
{
    /** Multiple choice, scored in code. Free and never metered. */
    case Quiz = 'quiz';
    /**
     * A snippet reviewed like a pull request; the model matches comments to
     * planted issues and code scores them (Services\Practice\CodeReviewScorer).
     * The `code_review` plan feature.
     */
    case CodeReview = 'code_review';
    /**
     * A scenario answered in sections; the model rates rubric traits and
     * code gates and sums them (Services\Practice\SystemDesignRubric). The
     * `system_design` plan feature.
     */
    case SystemDesign = 'system_design';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
