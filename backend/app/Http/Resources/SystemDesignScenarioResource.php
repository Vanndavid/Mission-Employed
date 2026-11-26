<?php

namespace App\Http\Resources;

use App\Models\PracticeQuestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A system design scenario as a user is served it: never its key points or
 * its explanation, which come back only with a scored answer. The title is
 * stored as the bank's `topic`. Matches SystemDesignScenario in
 * frontend/types/systemDesign.ts.
 *
 * @mixin PracticeQuestion
 */
class SystemDesignScenarioResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->topic,
            'difficulty' => $this->difficulty,
            'prompt' => $this->prompt,
        ];
    }
}
