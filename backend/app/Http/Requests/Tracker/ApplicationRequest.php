<?php

namespace App\Http\Requests\Tracker;

use App\Enums\JobStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared input handling for creating and updating an application. Only the
 * required/optional split differs between the two, so both the empty-string
 * normalization and the camelCase-to-column mapping live here once.
 */
abstract class ApplicationRequest extends FormRequest
{
    /**
     * Client field => database column. `recruiterContact` is deliberately
     * absent: it arrives nested and is flattened separately.
     *
     * @var array<string, string>
     */
    protected const COLUMN_MAP = [
        'company' => 'company',
        'role' => 'role',
        'location' => 'location',
        'url' => 'url',
        'status' => 'status',
        'isImportant' => 'is_important',
        'dateApplied' => 'date_applied',
        'notes' => 'notes',
        'jobDescription' => 'job_description',
        'coverLetter' => 'cover_letter',
        'tailoredCV' => 'tailored_cv',
        'nextAction' => 'next_action',
        'nextActionDue' => 'next_action_due',
        'offer' => 'offer',
        'takeHome' => 'take_home',
    ];

    /**
     * Fields the client sends as '' when the input was never touched. The date
     * columns are the reason this exists — SQLite happily stores '' in a date
     * column and every later read of it is junk.
     *
     * @var list<string>
     */
    private const BLANKABLE = [
        'location',
        'url',
        'dateApplied',
        'notes',
        'jobDescription',
        'coverLetter',
        'tailoredCV',
        'nextAction',
        'nextActionDue',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * Turn '' into null before validation, for the top-level fields and for the
     * nested recruiter object. Only keys actually present are touched, so
     * `sometimes` rules still mean "the client did not send this".
     */
    protected function prepareForValidation(): void
    {
        $input = $this->all();

        foreach (self::BLANKABLE as $key) {
            if (array_key_exists($key, $input) && $this->isBlankString($input[$key])) {
                $input[$key] = null;
            }
        }

        if (array_key_exists('recruiterContact', $input) && is_array($input['recruiterContact'])) {
            foreach (['name', 'email', 'linkedin'] as $key) {
                if (array_key_exists($key, $input['recruiterContact'])
                    && $this->isBlankString($input['recruiterContact'][$key])) {
                    $input['recruiterContact'][$key] = null;
                }
            }
        }

        $this->replace($input);
    }

    private function isBlankString(mixed $value): bool
    {
        return is_string($value) && trim($value) === '';
    }

    /**
     * The validated payload as database columns, including the flattened
     * recruiter fields. Absent keys stay absent so PATCH can be partial.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        $validated = $this->validated();
        $columns = [];

        foreach (self::COLUMN_MAP as $field => $column) {
            if (array_key_exists($field, $validated)) {
                $columns[$column] = $validated[$field];
            }
        }

        if (array_key_exists('recruiterContact', $validated)) {
            $recruiter = $validated['recruiterContact'] ?? [];

            $columns['recruiter_name'] = $recruiter['name'] ?? null;
            $columns['recruiter_email'] = $recruiter['email'] ?? null;
            $columns['recruiter_linkedin'] = $recruiter['linkedin'] ?? null;
        }

        return $columns;
    }

    /**
     * Rules shared by store and update. The caller supplies the presence rule
     * ('required' when creating, 'sometimes' when patching) for the two fields
     * that are mandatory on an application.
     *
     * @return array<string, list<string>>
     */
    protected function sharedRules(): array
    {
        return [
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'status' => ['sometimes', 'required', 'string', 'in:'.implode(',', JobStatus::values())],
            'isImportant' => ['sometimes', 'boolean'],
            'dateApplied' => ['sometimes', 'nullable', 'date'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'jobDescription' => ['sometimes', 'nullable', 'string'],
            'coverLetter' => ['sometimes', 'nullable', 'string'],
            'tailoredCV' => ['sometimes', 'nullable', 'string'],
            'nextAction' => ['sometimes', 'nullable', 'string', 'max:255'],
            'nextActionDue' => ['sometimes', 'nullable', 'date'],

            'recruiterContact' => ['sometimes', 'nullable', 'array'],
            'recruiterContact.name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'recruiterContact.email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'recruiterContact.linkedin' => ['sometimes', 'nullable', 'string', 'max:2048'],

            'takeHome' => ['sometimes', 'nullable', 'array'],
            'takeHome.deadline' => ['sometimes', 'nullable', 'string', 'max:255'],
            'takeHome.repo' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'takeHome.status' => ['sometimes', 'nullable', 'string', 'in:not_started,in_progress,submitted'],

            'offer' => ['sometimes', 'nullable', 'array'],
            'offer.base' => ['sometimes', 'nullable', 'numeric'],
            'offer.equity' => ['sometimes', 'nullable', 'string', 'max:255'],
            'offer.benefits' => ['sometimes', 'nullable', 'string'],
            'offer.startDate' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
