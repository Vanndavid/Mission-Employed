<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class BehavioralEvaluateRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Base64 webm from MediaRecorder. nginx caps the body at 10m.
            'audioBase64' => ['required', 'string'],
            'theme' => ['required', 'string', 'max:255'],
            'prompt' => ['required', 'string'],
            // The candidate's saved STAR bullets for this theme, if any.
            'facts' => ['sometimes', 'array'],
            // ConvertEmptyStringsToNull is a global middleware, so a blank
            // bullet arrives as null rather than ''. facts() drops them.
            'facts.*' => ['nullable', 'string'],
        ];
    }

    /** @return list<string> */
    public function facts(): array
    {
        /** @var array<int, mixed> $facts */
        $facts = $this->input('facts', []);

        return array_values(array_filter(
            array_map(static fn ($fact) => is_string($fact) ? trim($fact) : '', $facts),
            static fn (string $fact) => $fact !== '',
        ));
    }
}
