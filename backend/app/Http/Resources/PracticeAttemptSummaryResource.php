<?php

namespace App\Http\Resources;

use App\Enums\PracticeKind;
use App\Models\PracticeAttempt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One line of practice history: which mode, what it was on, and how it
 * went. Never the answer: that is for the attempt's own page
 * ({@see PracticeAttemptDetailResource}). A quiz attempt is titled by its
 * question and names its topic; a code review snippet's and a system design
 * scenario's title is the bank's `topic`. Matches PracticeAttemptSummary in
 * frontend/types/practiceHistory.ts.
 *
 * @mixin PracticeAttempt
 */
class PracticeAttemptSummaryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $question = $this->question;
        $isQuiz = $this->kind === PracticeKind::Quiz;

        return [
            'id' => $this->id,
            'kind' => $this->kind->value,
            'title' => $isQuiz ? $question->prompt : $question->topic,
            'language' => $question->language?->value,
            'topic' => $isQuiz ? $question->topic : null,
            'topicLabel' => $isQuiz ? PracticeAttemptDetailResource::topicLabel($question) : null,
            'difficulty' => $question->difficulty,
            'score' => $this->score,
            'maxScore' => $this->max_score,
            'correct' => $this->correct,
            'createdAt' => $this->created_at?->toJSON(),
        ];
    }
}
