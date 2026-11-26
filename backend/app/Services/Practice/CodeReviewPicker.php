<?php

namespace App\Services\Practice;

use App\Enums\CodeReviewCategory;
use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;

/**
 * Which code review snippet to serve next: one the user has never reviewed,
 * at random, and once they have reviewed them all, the one reviewed longest
 * ago. Only published snippets are in the pool, the way the quiz's rounds
 * are picked ({@see QuizRounds}).
 */
class CodeReviewPicker
{
    public function __construct(private readonly PracticeHistory $history) {}

    /**
     * @param  int|null  $exclude  the snippet on screen, skipped unless it is the only one
     * @param  CodeReviewCategory|null  $category  only snippets with an issue of this category planted
     * @return array{snippet: PracticeQuestion|null, reviewedBefore: bool, total: int, unreviewed: int}
     */
    public function next(User $user, ?PracticeLanguage $language, ?string $difficulty, ?int $exclude = null, ?CodeReviewCategory $category = null): array
    {
        $pool = PracticeQuestion::query()
            ->servable(PracticeKind::CodeReview)
            ->when($language !== null, fn ($query) => $query->where('language', $language))
            ->when($difficulty !== null, fn ($query) => $query->where('difficulty', $difficulty))
            ->get()
            // The issues are JSON in the key; read here rather than queried, so
            // nothing depends on the database's JSON functions.
            ->when($category !== null, fn ($pool) => $pool->filter(
                fn (PracticeQuestion $q) => collect($q->answer['issues'] ?? [])->contains('category', $category->value),
            )->values());

        $latest = $this->history->latestAttempts($user, PracticeKind::CodeReview);

        $candidates = $pool->count() > 1 && $exclude !== null
            ? $pool->reject(fn (PracticeQuestion $q) => $q->id === $exclude)
            : $pool;

        // Shuffled first so the never-reviewed ones, which tie, come in a
        // random order; sortBy is stable.
        $snippet = $candidates
            ->shuffle()
            ->sortBy(fn (PracticeQuestion $q) => $this->reviewedAt($latest->get($q->id)))
            ->first();

        return [
            'snippet' => $snippet,
            'reviewedBefore' => $snippet !== null && $latest->has($snippet->id),
            'total' => $pool->count(),
            'unreviewed' => $pool->reject(fn (PracticeQuestion $q) => $latest->has($q->id))->count(),
        ];
    }

    /** When the snippet was last reviewed; never reviewed sorts first. */
    private function reviewedAt(?PracticeAttempt $attempt): int
    {
        return $attempt?->created_at?->getTimestamp() ?? PHP_INT_MIN;
    }
}
