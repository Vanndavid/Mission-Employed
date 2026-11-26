<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ?kind=&page= on the practice history, both optional: no kind is every mode. */
class PracticeAttemptIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'kind' => ['nullable', 'string', Rule::in(PracticeKind::values())],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function kind(): ?PracticeKind
    {
        return PracticeKind::tryFrom((string) $this->validated('kind'));
    }

    public function page(): int
    {
        return (int) ($this->validated('page') ?? 1);
    }
}
