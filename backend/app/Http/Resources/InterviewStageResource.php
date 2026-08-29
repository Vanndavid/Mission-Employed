<?php

namespace App\Http\Resources;

use App\Models\InterviewStage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Matches InterviewStage in frontend/types.ts.
 *
 * `id` is now an auto-increment integer rather than the client-generated UUID
 * the old localStorage state used — see "IDs changed type" in TASKS.md.
 *
 * @mixin InterviewStage
 */
class InterviewStageResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            // The client's field is a plain string and is never null there, so
            // an unscheduled stage reads back as '' rather than null.
            'scheduledAt' => $this->scheduled_at?->toIso8601String() ?? '',
            'notes' => $this->notes ?? '',
        ];
    }
}
