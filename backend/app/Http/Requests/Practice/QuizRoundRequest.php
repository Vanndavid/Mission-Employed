<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeLanguage;
use App\Services\Practice\QuizRounds;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * {language, topic}: a topic of that language, `mixed` or `mistakes`. A topic
 * of another language is not one of this language's.
 */
class QuizRoundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $language = PracticeLanguage::tryFrom((string) $this->input('language'));

        return [
            'language' => ['required', 'string', Rule::in(PracticeLanguage::values())],
            'topic' => ['required', 'string', Rule::in([
                ...array_keys($language?->topics() ?? []),
                QuizRounds::MIXED,
                QuizRounds::MISTAKES,
            ])],
        ];
    }

    public function language(): PracticeLanguage
    {
        return PracticeLanguage::from($this->validated('language'));
    }

    public function topic(): string
    {
        return $this->validated('topic');
    }
}
