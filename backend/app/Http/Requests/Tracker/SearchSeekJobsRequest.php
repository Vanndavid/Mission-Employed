<?php

namespace App\Http\Requests\Tracker;

use App\Services\Seek\SeekJobSearch;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Query string for GET /api/seek/jobs. Everything is optional: an empty
 * search still loads the default software-engineer / All Australia listing
 * so the Job Applications page can populate the Seek section on mount.
 */
class SearchSeekJobsRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'keywords' => ['sometimes', 'nullable', 'string', 'max:200'],
            'where' => ['sometimes', 'nullable', 'string', 'max:200'],
            'page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
            'pageSize' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:'.SeekJobSearch::MAX_PAGE_SIZE],
            'sort' => ['sometimes', 'nullable', 'string', Rule::in([
                SeekJobSearch::SORT_LISTED_DATE,
                SeekJobSearch::SORT_RELEVANCE,
            ])],
        ];
    }
}
