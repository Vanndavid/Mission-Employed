<?php

namespace App\Http\Resources;

use App\Models\BehavioralAnswer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Matches BehavioralAnswer in frontend/types.ts. The theme id, not the row id,
 * is the client-facing key — answers are per-user global and edited in place.
 *
 * @mixin BehavioralAnswer
 */
class BehavioralAnswerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'themeId' => $this->theme_id,
            'bullets' => $this->bullets ?? [],
        ];
    }
}
