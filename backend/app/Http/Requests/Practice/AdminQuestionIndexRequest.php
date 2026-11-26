<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ?kind=&status=&language=&topic=&source=&reported=1&page=, every one optional. */
class AdminQuestionIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'kind' => ['sometimes', 'nullable', Rule::in(PracticeKind::values())],
            'status' => ['sometimes', 'nullable', Rule::in(PracticeQuestionStatus::values())],
            'language' => ['sometimes', 'nullable', Rule::in(PracticeLanguage::values())],
            'topic' => ['sometimes', 'nullable', 'string', 'max:64'],
            'source' => ['sometimes', 'nullable', Rule::in(PracticeQuestionSource::values())],
            'reported' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> column => value, for the filters given */
    public function filters(): array
    {
        return array_filter(
            $this->safe()->only(['kind', 'status', 'language', 'topic', 'source']),
            fn (mixed $value) => is_string($value) && $value !== '',
        );
    }

    public function onlyReported(): bool
    {
        return $this->boolean('reported');
    }

    public function page(): int
    {
        return (int) ($this->validated('page') ?? 1);
    }
}
