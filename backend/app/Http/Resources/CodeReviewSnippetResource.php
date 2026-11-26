<?php

namespace App\Http\Resources;

use App\Models\PracticeQuestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A code review snippet as a user is served it: what the code does and the
 * code, never its planted issues or the takeaway. Those come back only with
 * a scored review. The title is stored in `topic`. Matches CodeReviewSnippet
 * in frontend/types/codeReview.ts.
 *
 * @mixin PracticeQuestion
 */
class CodeReviewSnippetResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'language' => $this->language?->value,
            'title' => $this->topic,
            'difficulty' => $this->difficulty,
            'prompt' => $this->prompt,
            'code' => $this->code,
        ];
    }
}
