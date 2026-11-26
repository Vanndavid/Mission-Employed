<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;

/**
 * Which {@see PracticeKind}s the AI can draft, and how each is checked. The
 * generate endpoint and every edit on the question bank look a kind up here,
 * so adding one is a line in KINDS plus its own {@see DraftKind}. A kind not
 * listed is refused with a 422 that says so.
 */
class DraftKinds
{
    /** @var array<string, class-string<DraftKind>> PracticeKind value => its drafts */
    private const KINDS = [
        'quiz' => QuizDrafts::class,
        'code_review' => CodeReviewDrafts::class,
        'system_design' => SystemDesignDrafts::class,
    ];

    public function for(PracticeKind $kind): ?DraftKind
    {
        $class = self::KINDS[$kind->value] ?? null;

        return $class === null ? null : app($class);
    }

    /**
     * The kinds that can be drafted, in PracticeKind order.
     *
     * @return list<string>
     */
    public function kinds(): array
    {
        return array_values(array_filter(
            PracticeKind::values(),
            fn (string $kind) => isset(self::KINDS[$kind]),
        ));
    }

    /** "system design" for system_design, for messages. */
    public static function label(PracticeKind $kind): string
    {
        return str_replace('_', ' ', $kind->value);
    }
}
