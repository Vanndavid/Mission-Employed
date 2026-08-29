<?php

namespace App\Http\Requests\Tracker;

use App\Models\BehavioralAnswer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Saving one theme's STAR bullets. The route parameter is the client-side theme
 * id string, not a row id, so it is validated as input rather than resolved as
 * a model — an unknown theme is a 422, not a 404.
 */
class UpdateBehavioralAnswerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** Pull the route segment into the payload so one rule set covers both. */
    protected function prepareForValidation(): void
    {
        $this->merge(['themeId' => $this->route('themeId')]);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'themeId' => ['required', 'string', 'in:'.implode(',', BehavioralAnswer::THEME_IDS)],
            'bullets' => ['required', 'array'],
            'bullets.*' => ['string'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'themeId.in' => 'That is not a behavioral theme.',
        ];
    }

    public function themeId(): string
    {
        return (string) $this->validated()['themeId'];
    }

    /** @return list<string> */
    public function bullets(): array
    {
        return array_values($this->validated()['bullets']);
    }
}
