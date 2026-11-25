<?php

namespace App\Http\Resources;

use App\Models\PracticeQuestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;

/**
 * A quiz question as a user is served it: the options in a fresh random
 * order, and never the answer or the explanation. Those come back only from
 * POST /api/practice/quiz/answers, once the question has been answered.
 * Matches QuizQuestion in frontend/types/practice.ts.
 *
 * @mixin PracticeQuestion
 */
class QuizQuestionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'topic' => $this->topic,
            'difficulty' => $this->difficulty,
            'prompt' => $this->prompt,
            'code' => $this->code,
            'options' => Arr::shuffle($this->options ?? []),
        ];
    }
}
