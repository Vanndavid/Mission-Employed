<?php

namespace App\Http\Resources;

use App\Models\CodingAttempt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Matches CodingHistoryEntry in frontend/types.ts — which keys the timestamp
 * as `date`, not `attemptedAt`. `id` is extra; the client ignores it.
 *
 * @mixin CodingAttempt
 */
class CodingAttemptResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'date' => $this->attempted_at?->toIso8601String(),
            'difficulty' => $this->difficulty,
            'title' => $this->title,
            'completed' => (bool) $this->completed,
            'topics' => $this->topics ?? [],
        ];
    }
}
