<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Opens a refine chat over a cover letter or CV the user already has — just
 * generated, saved earlier, or edited by hand. The job description is optional:
 * the studios fall back to the application's notes, which may be empty too.
 */
class DocumentSessionRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'company' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
            'jobDescription' => ['nullable', 'string'],
            'document' => ['required', 'string'],
        ];
    }

    /** @return array{company: string, role: string, jobDescription: string, document: string} */
    public function refine(): array
    {
        return [
            'company' => $this->string('company')->trim()->value(),
            'role' => $this->string('role')->trim()->value(),
            'jobDescription' => $this->string('jobDescription')->trim()->value(),
            'document' => $this->string('document')->trim()->value(),
        ];
    }
}
