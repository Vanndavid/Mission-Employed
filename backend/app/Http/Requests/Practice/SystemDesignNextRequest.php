<?php

namespace App\Http\Requests\Practice;

use App\Models\PracticeQuestion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ?difficulty= (any when absent) and ?skip=, the scenario on screen. */
class SystemDesignNextRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'difficulty' => ['nullable', 'string', Rule::in(PracticeQuestion::DIFFICULTIES)],
            'skip' => ['nullable', 'integer'],
        ];
    }

    public function difficulty(): ?string
    {
        return $this->validated('difficulty');
    }

    public function skip(): ?int
    {
        $skip = $this->validated('skip');

        return $skip === null ? null : (int) $skip;
    }
}
