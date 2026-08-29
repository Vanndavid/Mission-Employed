<?php

namespace App\Http\Requests\Tracker;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The CV and cover letter settings. A PUT here is a whole-form save from the
 * settings screen, but every field stays optional so a partial save is legal.
 */
class UpdateProfileRequest extends FormRequest
{
    /** @var array<string, string> */
    private const COLUMN_MAP = [
        'baseCV' => 'base_cv',
        'cvFileName' => 'cv_file_name',
        'baseCoverLetter' => 'base_cover_letter',
        'portfolioUrl' => 'portfolio_url',
        'coverLetterTemplate' => 'cover_letter_template',
        'cvTemplate' => 'cv_template',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'baseCV' => ['sometimes', 'nullable', 'string'],
            'cvFileName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'baseCoverLetter' => ['sometimes', 'nullable', 'string'],
            'portfolioUrl' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'coverLetterTemplate' => ['sometimes', 'nullable', 'string'],
            'cvTemplate' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /** @return array<string, mixed> */
    public function columns(): array
    {
        $validated = $this->validated();
        $columns = [];

        foreach (self::COLUMN_MAP as $field => $column) {
            if (array_key_exists($field, $validated)) {
                // '' is kept as '' here: these are free text fields, not dates,
                // and clearing one is a real edit the user just made.
                $columns[$column] = $validated[$field];
            }
        }

        return $columns;
    }
}
