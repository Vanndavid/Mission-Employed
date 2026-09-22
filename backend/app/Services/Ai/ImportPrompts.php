<?php

namespace App\Services\Ai;

use App\Enums\JobStatus;

/**
 * Prompt and schema for mapping an arbitrary spreadsheet onto tracker fields.
 *
 * The model maps the *vocabulary*, not the rows. It sees the header row, a
 * handful of sample rows and the distinct values of the low-cardinality
 * columns, and answers with a plan: which column index feeds each of our
 * fields, and how the sheet's own status and channel words translate. The
 * client then applies that plan to every row deterministically.
 *
 * Two consequences worth keeping:
 *
 * 1. **Cost and determinism.** A 500-row sheet costs the same as a 10-row one,
 *    and the same sheet always imports identically.
 * 2. **A wrong answer is cheap.** The plan is a reviewable form in the client,
 *    so a bad guess costs one dropdown rather than 500 bad rows.
 *
 * The model answers with column *indices*, never header text, so a blank or
 * duplicated header cannot break the join.
 */
class ImportPrompts
{
    /** The fields a spreadsheet column can be mapped onto, in schema order. */
    public const FIELDS = [
        'company',
        'role',
        'location',
        'url',
        'source',
        'status',
        'dateApplied',
        'statusDate',
        'notes',
        'nextAction',
    ];

    /** Index meaning "no column feeds this field". */
    public const NO_COLUMN = -1;

    /** Sample rows are truncated to this many characters per cell. */
    private const CELL_LIMIT = 120;

    /**
     * @param  list<string>  $headers
     * @param  list<list<string>>  $sampleRows
     * @param  array<int, list<string>>  $columnValues  header index => distinct values
     */
    public static function plan(array $headers, array $sampleRows, array $columnValues): string
    {
        $statuses = implode(', ', JobStatus::values());
        $none = self::NO_COLUMN;
        $renderedHeaders = self::renderHeaders($headers);
        $renderedRows = self::renderRows($sampleRows);
        $renderedValues = self::renderColumnValues($columnValues);

        return <<<PROMPT
            You are mapping a spreadsheet of job applications onto a job tracker's fields.

            The spreadsheet's columns, by index:
            {$renderedHeaders}

            Sample rows:
            {$renderedRows}

            Distinct values in the low-cardinality columns:
            {$renderedValues}

            Return JSON describing how to import this sheet.

            "columns" maps each tracker field to the index of the column that feeds it.
            Use {$none} when no column in this sheet corresponds to that field. Never guess
            a column that is not there — a missing column is normal and expected.

            Judge a column by its values, not only its name:
            - A column of dates is a date column. Prefer the one that reads as when the
              application was sent for dateApplied, and when its status last changed for
              statusDate.
            - A column of small integers that counts rows, or counts days elapsed, is NOT
              a date. Return {$none} for it.
            - A column naming a job board, a recruiter, or a company's own site is "source".
            - Free-text remarks are "notes". A column of outstanding to-dos is "nextAction".

            "statusMap" translates this sheet's status wording into ours. Every distinct
            value from the status column must appear exactly once, with:
            - "status": one of exactly these: {$statuses}
            - "nextAction": what the user still has to do, when the sheet's wording implies
              an unresolved action (for instance a status meaning the employer has replied
              and the message has not been read yet). "" when it implies nothing to do.
            - "noteSuffix": a short phrase preserving meaning our five statuses cannot
              express — for instance a status meaning the role was filled rather than the
              candidate rejected. "" when nothing is lost.

            "sourceMap" does the same for the source column's values, normalising casing
            and abbreviations into a clean name. Omit it when there is no source column.

            "dateFormatHint" describes how the date cells are written, for example
            "D MMM YYYY" or "DD/MM/YYYY". "notes" is one sentence for a human reviewing
            this plan, naming anything ambiguous you had to guess at.
            PROMPT;
    }

    /** @return array<string, mixed> */
    public static function planSchema(): array
    {
        $columns = [];

        foreach (self::FIELDS as $field) {
            $columns[$field] = ['type' => 'INTEGER'];
        }

        return [
            'type' => 'OBJECT',
            'properties' => [
                'columns' => [
                    'type' => 'OBJECT',
                    'properties' => $columns,
                    'required' => ['company', 'role'],
                ],
                // Arrays of pairs, not objects keyed by the sheet's wording:
                // Gemini's responseSchema has no dictionary type, so
                // "the keys are arbitrary strings" is inexpressible.
                'statusMap' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'from' => ['type' => 'STRING'],
                            'status' => ['type' => 'STRING'],
                            'nextAction' => ['type' => 'STRING'],
                            'noteSuffix' => ['type' => 'STRING'],
                        ],
                        'required' => ['from', 'status'],
                    ],
                ],
                'sourceMap' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'from' => ['type' => 'STRING'],
                            'source' => ['type' => 'STRING'],
                        ],
                        'required' => ['from', 'source'],
                    ],
                ],
                'dateFormatHint' => ['type' => 'STRING'],
                'notes' => ['type' => 'STRING'],
            ],
            'required' => ['columns', 'statusMap'],
        ];
    }

    /** @param  list<string>  $headers */
    private static function renderHeaders(array $headers): string
    {
        $lines = [];

        foreach ($headers as $index => $header) {
            $name = trim($header) === '' ? '(blank)' : trim($header);
            $lines[] = "{$index}: {$name}";
        }

        return $lines === [] ? '(none)' : implode("\n", $lines);
    }

    /** @param  list<list<string>>  $rows */
    private static function renderRows(array $rows): string
    {
        $lines = [];

        foreach ($rows as $row) {
            $cells = array_map(
                static fn ($cell) => mb_substr(trim((string) $cell), 0, self::CELL_LIMIT),
                $row,
            );

            $lines[] = implode(' | ', $cells);
        }

        return $lines === [] ? '(none)' : implode("\n", $lines);
    }

    /** @param  array<int, list<string>>  $columnValues */
    private static function renderColumnValues(array $columnValues): string
    {
        $lines = [];

        foreach ($columnValues as $index => $values) {
            $rendered = implode(', ', array_map(
                static fn ($value) => '"'.mb_substr(trim((string) $value), 0, self::CELL_LIMIT).'"',
                $values,
            ));

            $lines[] = "column {$index}: {$rendered}";
        }

        return $lines === [] ? '(none)' : implode("\n", $lines);
    }
}
