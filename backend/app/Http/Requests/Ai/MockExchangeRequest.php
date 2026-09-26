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
            // Gemini Live's usageMetadata for the turn, as the browser received
            // it. The server never sees Live traffic, so this is the only count
            // there is; the caps keep a tampered client from writing nonsense.
            'usage' => ['nullable', 'array'],
            'usage.promptTokenCount' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_TOKENS],
            'usage.responseTokenCount' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_TOKENS],
            'usage.thoughtsTokenCount' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_TOKENS],
            'usage.totalTokenCount' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_TOKENS],
            'usage.promptTokensDetails' => ['sometimes', 'array', 'max:8'],
            'usage.promptTokensDetails.*.modality' => ['string', 'max:16'],
            'usage.promptTokensDetails.*.tokenCount' => ['integer', 'min:0', 'max:'.self::MAX_TOKENS],
            'usage.responseTokensDetails' => ['sometimes', 'array', 'max:8'],
            'usage.responseTokensDetails.*.modality' => ['string', 'max:16'],
            'usage.responseTokensDetails.*.tokenCount' => ['integer', 'min:0', 'max:'.self::MAX_TOKENS],
        ];
    }

    /** One Live turn cannot plausibly bill more than this. */
    private const MAX_TOKENS = 2_000_000;

    /** @return array<string, mixed>|null */
    public function usage(): ?array
    {
        $usage = $this->validated('usage');

        return is_array($usage) && $usage !== [] ? $usage : null;
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
