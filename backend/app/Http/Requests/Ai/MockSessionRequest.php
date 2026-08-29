<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class MockSessionRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Optional: the Node handler ran the interview with or without it.
            'companyContext' => ['nullable', 'array'],
            'companyContext.company' => ['nullable', 'string', 'max:255'],
            'companyContext.role' => ['nullable', 'string', 'max:255'],
            'companyContext.jobDescription' => ['nullable', 'string'],
            'companyContext.facts' => ['nullable', 'string'],
        ];
    }

    /**
     * The context to store on the session, or null when it is entirely blank —
     * an object of empty strings would put a meaningless "Company:" block into
     * every prompt for the rest of the interview.
     *
     * @return array<string, string>|null
     */
    public function companyContext(): ?array
    {
        /** @var array<string, mixed> $context */
        $context = $this->input('companyContext') ?? [];

        $clean = [];

        foreach (['company', 'role', 'jobDescription', 'facts'] as $key) {
            $value = $context[$key] ?? null;
            $value = is_scalar($value) ? trim((string) $value) : '';

            if ($value !== '') {
                $clean[$key] = $value;
            }
        }

        return $clean === [] ? null : $clean;
    }
}
