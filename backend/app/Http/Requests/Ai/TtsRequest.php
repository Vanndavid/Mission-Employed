<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class TtsRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // One interview question read aloud, not a document.
            'text' => ['required', 'string', 'max:5000'],
        ];
    }
}
