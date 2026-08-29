<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared by the cover letter and the tailored CV — the Node handlers took the
 * same destructured object for both.
 */
class DocumentRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'company' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
            'jobDescription' => ['required', 'string'],
            'cv' => ['required', 'string'],
            // Style notes; both prompts fall back to their own default.
            'template' => ['nullable', 'string'],
            // The client sends '' for an untouched input.
            'portfolioUrl' => ['nullable', 'string', 'max:2048'],
        ];
    }

    /** @return array<string, mixed> */
    public function document(): array
    {
        return $this->only(['company', 'role', 'jobDescription', 'cv', 'template', 'portfolioUrl']);
    }
}
