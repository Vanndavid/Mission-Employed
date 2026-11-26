<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Models\PracticeQuestion;
use App\Models\User;

/**
 * Which system design scenario to serve next: one the user has never
 * answered (at random), else the one they answered longest ago. Worked out
 * from practice_attempts every time, like the quiz's rounds.
 */
class SystemDesignScenarios
{
    public function __construct(private readonly PracticeHistory $history) {}

    /**
     * @param  string|null  $difficulty  one of PracticeQuestion::DIFFICULTIES, or any
     * @param  int|null  $skip  the scenario on screen, passed over when there is another
     */
    public function next(User $user, ?string $difficulty = null, ?int $skip = null): ?PracticeQuestion
    {
        $candidates = PracticeQuestion::query()
            ->servable(PracticeKind::SystemDesign)
            ->when($difficulty !== null, fn ($query) => $query->where('difficulty', $difficulty))
            ->get();

        if ($skip !== null && $candidates->count() > 1) {
            $candidates = $candidates->reject(fn (PracticeQuestion $question) => $question->id === $skip);
        }

        $latest = $this->history->latestAttempts($user, PracticeKind::SystemDesign);
        $unanswered = $candidates->reject(fn (PracticeQuestion $question) => $latest->has($question->id));

        if ($unanswered->isNotEmpty()) {
            return $unanswered->random();
        }

        // The latest attempt's id orders them: ids only grow, and two
        // attempts in one second cannot tie.
        return $candidates->sortBy(fn (PracticeQuestion $question) => $latest->get($question->id)?->id)->first();
    }
}
