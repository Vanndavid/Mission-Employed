<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeLanguage;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ?language= on the progress route. */
class QuizProgressRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'language' => ['required', 'string', Rule::in(PracticeLanguage::values())],
        ];
    }

    public function language(): PracticeLanguage
    {
        return PracticeLanguage::from($this->validated('language'));
    }
}
