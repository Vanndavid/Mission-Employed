<?php

namespace App\Http\Requests\Practice;

use App\Enums\CodeReviewCategory;
use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * ?language=&difficulty=&exclude=&category=, all optional: no language or
 * difficulty means any, and `exclude` is the snippet on screen, so "another
 * one" is another one. `category` asks for a snippet with an issue of that
 * kind planted in it, which is how the practice coach starts a review in the
 * user's weakest category (task 7.5).
 */
class CodeReviewNextRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'language' => ['nullable', 'string', Rule::in(PracticeLanguage::values())],
            'difficulty' => ['nullable', 'string', Rule::in(PracticeQuestion::DIFFICULTIES)],
            'exclude' => ['nullable', 'integer', 'min:1'],
            'category' => ['nullable', 'string', Rule::in(CodeReviewCategory::values())],
        ];
    }

    public function language(): ?PracticeLanguage
    {
        return PracticeLanguage::tryFrom((string) $this->validated('language'));
    }

    public function difficulty(): ?string
    {
        return $this->validated('difficulty');
    }

    public function exclude(): ?int
    {
        $exclude = $this->validated('exclude');

        return $exclude === null ? null : (int) $exclude;
    }

    public function category(): ?CodeReviewCategory
    {
        return CodeReviewCategory::tryFrom((string) $this->validated('category'));
    }
}
