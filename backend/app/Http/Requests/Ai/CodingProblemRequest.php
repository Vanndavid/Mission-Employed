<?php

namespace App\Http\Requests\Ai;

use App\Services\Ai\CodingPrompts;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CodingProblemRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // The Express route defaulted a missing difficulty to 'easy'.
            'difficulty' => ['nullable', 'string', Rule::in(CodingPrompts::DIFFICULTIES)],
        ];
    }

    public function difficulty(): string
    {
        $difficulty = $this->string('difficulty')->trim()->value();

        return $difficulty === '' ? CodingPrompts::DEFAULT_DIFFICULTY : $difficulty;
    }
}
