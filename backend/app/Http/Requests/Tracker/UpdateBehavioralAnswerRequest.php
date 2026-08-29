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
            // 'present' rather than 'required': clearing a theme means sending
            // an empty list, and 'required' rejects [] outright. The nullable on
            // the elements is for ConvertEmptyStringsToNull, which is global and
            // turns a blank bullet into null before validation ever sees it.
            'bullets' => ['present', 'array'],
            'bullets.*' => ['nullable', 'string'],
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

    /**
     * Blank bullets are dropped rather than rejected. The client sends a fixed
     * number of inputs and leaves unused ones empty, so treating a blank as a
     * validation failure would make a partially filled theme unsavable.
     *
     * @return list<string>
     */
    public function bullets(): array
    {
        $bullets = array_map(
            static fn ($bullet): string => trim((string) $bullet),
            $this->validated()['bullets']
        );

        return array_values(array_filter($bullets, static fn (string $b): bool => $b !== ''));
    }
}
