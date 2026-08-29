<?php

namespace App\Http\Requests\Tracker;

use App\Models\CodingAttempt;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One row of coding practice history. The client keys the timestamp as `date`
 * (CodingHistoryEntry in frontend/types.ts); the column is attempted_at.
 */
class StoreCodingAttemptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $date = $this->input('date');

        if (is_string($date) && trim($date) === '') {
            $this->merge(['date' => null]);
        }
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'difficulty' => ['required', 'string', 'in:'.implode(',', CodingAttempt::DIFFICULTIES)],
            'topics' => ['sometimes', 'nullable', 'array'],
            'topics.*' => ['string', 'max:255'],
            'completed' => ['sometimes', 'boolean'],
            'date' => ['sometimes', 'nullable', 'date'],
        ];
    }

    /** @return array<string, mixed> */
    public function columns(): array
    {
        $validated = $this->validated();

        return [
            'title' => $validated['title'],
            'difficulty' => $validated['difficulty'],
            'topics' => $validated['topics'] ?? [],
            'completed' => (bool) ($validated['completed'] ?? false),
            // An attempt with no date given happened now.
            'attempted_at' => $validated['date'] ?? now(),
        ];
    }
}
