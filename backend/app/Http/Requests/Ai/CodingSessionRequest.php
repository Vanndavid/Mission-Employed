<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class CodingSessionRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'problemTitle' => ['required', 'string', 'max:255'],
            'problemDescription' => ['required', 'string'],
        ];
    }
}
