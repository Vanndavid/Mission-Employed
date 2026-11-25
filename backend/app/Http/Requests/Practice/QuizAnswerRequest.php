<?php

namespace App\Http\Requests\Practice;

use Illuminate\Foundation\Http\FormRequest;

/**
 * {questionId, choice}. `choice` is the text of the option picked, since the
 * options are shuffled per round, or null when the timer ran out; it must be
 * sent either way. Whether it is one of the question's options is checked
 * once the question is found, so an unknown question is a 404 first.
 */
class QuizAnswerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'questionId' => ['required', 'integer'],
            'choice' => ['present', 'nullable', 'string', 'max:2000'],
        ];
    }

    public function questionId(): int
    {
        return (int) $this->validated('questionId');
    }

    public function choice(): ?string
    {
        return $this->validated('choice');
    }
}
