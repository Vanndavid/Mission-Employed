<?php

namespace App\Http\Requests\Tracker;

use App\Http\Concerns\GuardsApplicationOwnership;
use App\Models\InterviewStage;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Adding an interview stage to an application. system_design is a valid stage
 * type — only the practice drill was cut, not the interview round.
 */
class StoreInterviewStageRequest extends FormRequest
{
    use GuardsApplicationOwnership;

    public function authorize(): bool
    {
        $this->guardApplicationOwnership($this->route('application'), $this->user());

        return true;
    }

    /** '' from an untouched datetime input is no schedule at all. */
    protected function prepareForValidation(): void
    {
        $scheduledAt = $this->input('scheduledAt');

        if (is_string($scheduledAt) && trim($scheduledAt) === '') {
            $this->merge(['scheduledAt' => null]);
        }

        $notes = $this->input('notes');

        if (is_string($notes) && trim($notes) === '') {
            $this->merge(['notes' => null]);
        }
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'in:'.implode(',', InterviewStage::TYPES)],
            'scheduledAt' => ['sometimes', 'nullable', 'date'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /** @return array<string, mixed> */
    public function columns(): array
    {
        $validated = $this->validated();

        return [
            'type' => $validated['type'],
            'scheduled_at' => $validated['scheduledAt'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ];
    }
}
