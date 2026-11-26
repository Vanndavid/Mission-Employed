<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeQuestionStatus;
use App\Services\Practice\DraftValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A partial edit: any content field, and `status` to publish or unpublish.
 * Only types are checked here. Whether the question is right is the kind's
 * {@see DraftValidator}, run on the whole question once the edit is merged
 * in. `kind`, `source` and `externalId` are not editable and are ignored.
 */
class AdminQuestionUpdateRequest extends FormRequest
{
    /** Request field => practice_questions column. */
    private const COLUMNS = [
        'language' => 'language',
        'topic' => 'topic',
        'difficulty' => 'difficulty',
        'prompt' => 'prompt',
        'code' => 'code',
        'options' => 'options',
        'answer' => 'answer',
        'explanation' => 'explanation',
        'reviewNotes' => 'review_notes',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'language' => ['sometimes', 'nullable', 'string', 'max:32'],
            'topic' => ['sometimes', 'nullable', 'string', 'max:64'],
            'difficulty' => ['sometimes', 'nullable', 'string', 'max:16'],
            'prompt' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'code' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'options' => ['sometimes', 'nullable', 'array', 'max:10'],
            'options.*' => ['nullable', 'string', 'max:2000'],
            'answer' => ['sometimes', 'nullable', 'array'],
            'explanation' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'reviewNotes' => ['sometimes', 'nullable', 'array'],
            'status' => ['sometimes', 'required', Rule::in(PracticeQuestionStatus::values())],
        ];
    }

    /**
     * The content columns this edit sets, keyed by column. Whole values: an
     * edit to `options` replaces all four.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        $validated = $this->validated();
        $columns = [];

        foreach (self::COLUMNS as $field => $column) {
            if (array_key_exists($field, $validated)) {
                // Read from input, not validated(): validated() keeps only the
                // nested keys a rule names, and `answer` is shaped per kind.
                $columns[$column] = $this->input($field);
            }
        }

        return $columns;
    }

    public function status(): ?PracticeQuestionStatus
    {
        $status = $this->validated('status');

        return is_string($status) ? PracticeQuestionStatus::from($status) : null;
    }
}
