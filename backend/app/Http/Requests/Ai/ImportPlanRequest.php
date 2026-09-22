<?php

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A spreadsheet's shape, on its way to becoming a prompt.
 *
 * Every array and every string is capped. This payload is assembled from a
 * file the user picked, so its size is entirely under their control, and it
 * ends up interpolated into a prompt we pay per token for. Bounding it here —
 * at the validation layer, where a breach is a clean 422 — is cheaper than
 * truncating it later and wondering why a mapping came back wrong.
 */
class ImportPlanRequest extends FormRequest
{
    /** How many sample rows the model is shown. Mirrors the client's slice. */
    public const MAX_SAMPLE_ROWS = 8;

    /** A column with more distinct values than this is not a vocabulary. */
    public const MAX_DISTINCT_VALUES = 40;

    private const MAX_COLUMNS = 64;

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'headers' => ['required', 'array', 'min:1', 'max:'.self::MAX_COLUMNS],
            'headers.*' => ['nullable', 'string', 'max:200'],

            'sampleRows' => ['required', 'array', 'max:'.self::MAX_SAMPLE_ROWS],
            'sampleRows.*' => ['array', 'max:'.self::MAX_COLUMNS],
            'sampleRows.*.*' => ['nullable', 'string', 'max:500'],

            'columnValues' => ['sometimes', 'array', 'max:'.self::MAX_COLUMNS],
            'columnValues.*' => ['array', 'max:'.self::MAX_DISTINCT_VALUES],
            'columnValues.*.*' => ['nullable', 'string', 'max:200'],
        ];
    }
}
