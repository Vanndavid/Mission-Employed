<?php

namespace App\Http\Controllers\Ai;

use App\Enums\JobStatus;
use App\Http\Requests\Ai\ImportPlanRequest;
use App\Services\Ai\ImportPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * Mapping an arbitrary spreadsheet onto tracker fields.
 *
 * Like {@see JobController::parse()}, this persists nothing: it answers with a
 * plan, and the client turns that plan into rows and posts them through the
 * ordinary tracker endpoints. Ownership, validation and the status timeline
 * stay where they already are.
 *
 * The model's answer is treated as untrusted input, not as an API response.
 * Everything it returns is clamped, whitelisted and de-duplicated below before
 * the client ever sees it — a hallucinated column index or an invented status
 * must not be able to reach a payload.
 */
class ImportController extends AiController
{
    /** The longest `next_action` the column can take. */
    private const NEXT_ACTION_LIMIT = 255;

    public function plan(ImportPlanRequest $request, GeminiClient $gemini): JsonResponse
    {
        /** @var list<string> $headers */
        $headers = array_map(fn ($header) => $this->text($header), $request->array('headers'));
        $sampleRows = $this->sampleRows($request->array('sampleRows'));
        $columnValues = $this->columnValues($request->array('columnValues'));

        try {
            $plan = $gemini->generateJson(
                ImportPrompts::plan($headers, $sampleRows, $columnValues),
                ImportPrompts::planSchema(),
            );
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'spreadsheet import mapping');
        }

        return response()->json([
            'columns' => $this->columns($plan['columns'] ?? null, count($headers)),
            'statusMap' => $this->statusMap($plan['statusMap'] ?? null),
            'sourceMap' => $this->sourceMap($plan['sourceMap'] ?? null),
            'dateFormatHint' => trim($this->text($plan['dateFormatHint'] ?? null)),
            'notes' => trim($this->text($plan['notes'] ?? null)),
        ]);
    }

    /**
     * One index per mappable field, clamped into range.
     *
     * Anything the model left out, wrote as prose, or pointed past the end of
     * the header row becomes "no column" rather than an error: a partial
     * mapping is still useful, and the client's form is where it gets fixed.
     *
     * @return array<string, int>
     */
    private function columns(mixed $raw, int $headerCount): array
    {
        $columns = [];

        foreach (ImportPrompts::FIELDS as $field) {
            $value = is_array($raw) ? ($raw[$field] ?? null) : null;

            $index = is_int($value) || (is_string($value) && preg_match('/^-?\d+$/', $value) === 1)
                ? (int) $value
                : ImportPrompts::NO_COLUMN;

            $columns[$field] = $index >= 0 && $index < $headerCount
                ? $index
                : ImportPrompts::NO_COLUMN;
        }

        return $columns;
    }

    /**
     * The status dictionary, keeping only entries we can actually apply.
     *
     * An entry whose status is not one of ours is dropped outright rather than
     * coerced to a default — a silently wrong status is worse than a missing
     * one, because the client shows missing entries as needing a choice.
     *
     * @return list<array<string, string>>
     */
    private function statusMap(mixed $raw): array
    {
        $rules = [];

        foreach ($this->entries($raw) as $entry) {
            $from = trim($this->text($entry['from'] ?? null));
            $status = trim($this->text($entry['status'] ?? null));

            if ($from === '' || ! in_array($status, JobStatus::values(), true)) {
                continue;
            }

            $key = mb_strtolower($from);

            if (array_key_exists($key, $rules)) {
                continue;
            }

            $rules[$key] = [
                'from' => $from,
                'status' => $status,
                'nextAction' => mb_substr(
                    trim($this->text($entry['nextAction'] ?? null)),
                    0,
                    self::NEXT_ACTION_LIMIT,
                ),
                'noteSuffix' => trim($this->text($entry['noteSuffix'] ?? null)),
            ];
        }

        return array_values($rules);
    }

    /** @return list<array<string, string>> */
    private function sourceMap(mixed $raw): array
    {
        $rules = [];

        foreach ($this->entries($raw) as $entry) {
            $from = trim($this->text($entry['from'] ?? null));
            $source = mb_substr(trim($this->text($entry['source'] ?? null)), 0, 255);

            if ($from === '' || $source === '') {
                continue;
            }

            $key = mb_strtolower($from);

            if (! array_key_exists($key, $rules)) {
                $rules[$key] = ['from' => $from, 'source' => $source];
            }
        }

        return array_values($rules);
    }

    /**
     * The array-of-objects entries out of a model answer, skipping anything
     * that is not shaped like one.
     *
     * @return list<array<mixed>>
     */
    private function entries(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_filter($raw, 'is_array'));
    }

    /**
     * @param  array<mixed>  $rows
     * @return list<list<string>>
     */
    private function sampleRows(array $rows): array
    {
        $sample = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $sample[] = array_values(array_map(fn ($cell) => $this->text($cell), $row));
        }

        return $sample;
    }

    /**
     * Distinct values per column, keyed by the integer column index.
     *
     * The client sends this as a JSON object, so the keys arrive as strings;
     * they are cast back so the prompt can name real column indices.
     *
     * @param  array<mixed>  $values
     * @return array<int, list<string>>
     */
    private function columnValues(array $values): array
    {
        $byColumn = [];

        foreach ($values as $index => $column) {
            if (! is_array($column) || ! is_numeric($index)) {
                continue;
            }

            $byColumn[(int) $index] = $this->strings($column);
        }

        ksort($byColumn);

        return $byColumn;
    }
}
