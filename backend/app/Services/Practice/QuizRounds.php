<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Picks a quiz round on the server, the way Eleph's Grammar Sprint does
 * (src/features/grammar/lib/grammarGame.ts, buildRound): a few open mistakes
 * come back, then questions not answered for longest, never-answered first.
 * A mistakes round is only open mistakes. Only published questions are ever
 * in the pool.
 */
class QuizRounds
{
    public const ROUND_SIZE = 10;

    /** A normal round brings back this many open mistakes, when there are that many. */
    public const MISTAKES_PER_ROUND = 3;

    /** Every topic of the language. */
    public const MIXED = 'mixed';

    /** Only the user's open mistakes in the language. */
    public const MISTAKES = 'mistakes';

    public function __construct(private readonly PracticeHistory $history) {}

    /**
     * Up to ROUND_SIZE questions, in a random order.
     *
     * @param  string  $topic  a topic key of the language, MIXED or MISTAKES
     * @return Collection<int, PracticeQuestion>
     */
    public function build(User $user, PracticeLanguage $language, string $topic): Collection
    {
        $pool = PracticeQuestion::query()
            ->servable(PracticeKind::Quiz)
            ->where('language', $language)
            ->when(! in_array($topic, [self::MIXED, self::MISTAKES], true), fn ($query) => $query->where('topic', $topic))
            ->get();

        $latest = $this->history->latestAttempts($user, PracticeKind::Quiz);
        $missed = $pool
            ->filter(fn (PracticeQuestion $q) => $latest->get($q->id)?->correct === false)
            ->shuffle();

        if ($topic === self::MISTAKES) {
            return $missed->take(self::ROUND_SIZE)->values();
        }

        $comeback = $missed->take(self::MISTAKES_PER_ROUND);

        // Shuffled first so questions answered at the same moment, and the
        // never-answered ones, come in a random order; sortBy is stable.
        $due = $pool
            ->diff($comeback)
            ->shuffle()
            ->sortBy(fn (PracticeQuestion $q) => $this->answeredAt($latest->get($q->id)));

        return $comeback
            ->concat($due->take(self::ROUND_SIZE - $comeback->count()))
            ->shuffle()
            ->values();
    }

    /** When the question was last answered; never answered sorts first. */
    private function answeredAt(?PracticeAttempt $attempt): int
    {
        return $attempt?->created_at?->getTimestamp() ?? PHP_INT_MIN;
    }
}
