<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class JobParseRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // A pasted job description or a one-line "applied to X as Y" log.
            'text' => ['required', 'string'],
        ];
    }
}
