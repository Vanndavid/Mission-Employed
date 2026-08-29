<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

class MockTurnRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Both optional: the opening turn has neither, and the model is
            // asked for the first question with an empty transcript.
            'audioBase64' => ['nullable', 'string'],
            // Typed fallback for a candidate without a microphone. The Express
            // version had no equivalent because the client owned the history.
            'answer' => ['nullable', 'string'],
        ];
    }

    public function audio(): ?string
    {
        $audio = $this->input('audioBase64');

        return is_string($audio) && $audio !== '' ? $audio : null;
    }

    public function typedAnswer(): ?string
    {
        $answer = $this->input('answer');
        $answer = is_string($answer) ? trim($answer) : '';

        return $answer === '' ? null : $answer;
    }
}
