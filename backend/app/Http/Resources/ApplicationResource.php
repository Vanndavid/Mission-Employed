<?php

namespace App\Http\Resources;

use App\Models\Application;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Matches JobApplication in frontend/types.ts, camelCase included, so Wave 3
 * needs no translation layer.
 *
 * Nullable text columns serialize as '' because the client types them as plain
 * strings and round-trips them straight back into form inputs.
 *
 * @mixin Application
 */
class ApplicationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company' => $this->company,
            'role' => $this->role,
            'location' => $this->location ?? '',
            'url' => $this->url ?? '',
            'dateApplied' => $this->date_applied?->format('Y-m-d') ?? '',
            'status' => $this->status->value,
            'notes' => $this->notes ?? '',
            'jobDescription' => $this->job_description ?? '',
            'coverLetter' => $this->cover_letter ?? '',
            'tailoredCV' => $this->tailored_cv ?? '',
            // Read directly rather than through whenLoaded(): the client types
            // these keys as always present, so they must never be omitted.
            // Controllers eager load both to keep the list endpoint flat.
            'interviewStages' => InterviewStageResource::collection($this->interviewStages),
            'nextAction' => $this->next_action ?? '',
            'nextActionDue' => $this->next_action_due?->format('Y-m-d') ?? '',
            // The accessor already treats all-blank recruiter columns as absent.
            'recruiterContact' => $this->recruiter_contact,
            'takeHome' => $this->take_home,
            'offer' => $this->offer,
            'statusHistory' => $this->statusEvents
                ->map(fn ($event) => [
                    'status' => $event->status->value,
                    'date' => $event->occurred_at?->toIso8601String(),
                ])
                ->values(),
        ];
    }
}
