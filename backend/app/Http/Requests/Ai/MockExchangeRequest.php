<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * One finished exchange from a Gemini Live interview, as the browser heard it:
 * the candidate's transcribed answer and the interviewer's transcribed reply.
 */
class MockExchangeRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Null for the opening question, which answers nothing.
            'answer' => ['nullable', 'string', 'max:20000'],
            // Null when the reply was cut off before any of it was spoken.
            'reply' => ['nullable', 'string', 'max:20000', 'required_without:answer'],
        ];
    }

    public function answer(): ?string
    {
        return $this->clean('answer');
    }

    public function reply(): ?string
    {
        return $this->clean('reply');
    }

    private function clean(string $key): ?string
    {
        $value = $this->input($key);
        $value = is_string($value) ? trim($value) : '';

        return $value === '' ? null : $value;
    }
}
