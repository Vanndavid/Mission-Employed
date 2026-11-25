<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Models\PracticeAttempt;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * What a user's attempts say, worked out from practice_attempts every time
 * rather than kept anywhere: it follows the account, and the MCP server can
 * read the same thing.
 */
class PracticeHistory
{
    /**
     * The user's latest attempt at each question of a kind they have
     * answered, keyed by question id. An open mistake is one whose latest
     * attempt is wrong; there is no other record of it. Latest is the highest
     * id, which cannot tie the way two answers in one second can.
     *
     * @return Collection<int, PracticeAttempt>
     */
    public function latestAttempts(User $user, PracticeKind $kind): Collection
    {
        return PracticeAttempt::query()
            ->whereIn('id', PracticeAttempt::query()
                ->selectRaw('max(id)')
                ->where('user_id', $user->id)
                ->where('kind', $kind)
                ->groupBy('practice_question_id'))
            ->get(['id', 'practice_question_id', 'correct', 'created_at'])
            ->keyBy('practice_question_id');
    }
}
