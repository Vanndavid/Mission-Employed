<?php

namespace App\Http\Resources;

use App\Models\Profile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The CV / cover letter half of AppState in frontend/types.ts: baseCV,
 * cvFileName, baseCoverLetter, portfolioUrl, coverLetterTemplate, cvTemplate.
 *
 * @mixin Profile
 */
class ProfileResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'baseCV' => $this->base_cv ?? '',
            'cvFileName' => $this->cv_file_name ?? '',
            'baseCoverLetter' => $this->base_cover_letter ?? '',
            'portfolioUrl' => $this->portfolio_url ?? '',
            'coverLetterTemplate' => $this->cover_letter_template ?? '',
            'cvTemplate' => $this->cv_template ?? '',
        ];
    }
}
