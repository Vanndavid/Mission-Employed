<?php

namespace App\Http\Requests\Practice;

use Illuminate\Foundation\Http\FormRequest;

/**
 * {comments: [{line, body}], summary?}. At least one comment, since a review
 * with none has nothing to match and would spend a use on nothing. Whether
 * each line is inside the snippet is checked once the snippet is found, so
 * an unknown snippet is a 404 rather than a line error.
 */
class CodeReviewSubmitRequest extends FormRequest
{
    public const MAX_COMMENTS = 40;

    public const MAX_COMMENT = 2000;

    public const MAX_SUMMARY = 4000;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'comments' => ['required', 'array', 'list', 'min:1', 'max:'.self::MAX_COMMENTS],
            'comments.*' => ['array'],
            'comments.*.line' => ['required', 'integer', 'min:1'],
            'comments.*.body' => ['required', 'string', 'max:'.self::MAX_COMMENT],
            'summary' => ['nullable', 'string', 'max:'.self::MAX_SUMMARY],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'comments.required' => 'Leave at least one comment on a line before submitting.',
            'comments.*.body.required' => 'A comment cannot be empty.',
        ];
    }

    /** @return list<array{line: int, body: string}> */
    public function comments(): array
    {
        return array_map(
            fn (array $comment) => ['line' => (int) $comment['line'], 'body' => (string) $comment['body']],
            $this->validated('comments'),
        );
    }

    public function summary(): ?string
    {
        return $this->validated('summary');
    }
}
