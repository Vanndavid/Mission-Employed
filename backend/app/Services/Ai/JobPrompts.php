<?php

namespace App\Services\Ai;

/**
 * Prompt and schema for pasting a job description into the tracker.
 *
 * Ported from `parseJobApplication` in server/aiHandlers.js. Its sibling
 * `analyzeJobDescription` is deliberately not ported: criteria scoring was cut
 * from the product (see CLAUDE.md, "Scope").
 */
class JobPrompts
{
    /** The fields the tracker will accept back, in schema order. */
    public const FIELDS = ['company', 'role', 'location', 'url', 'notes', 'jobDescription'];

    public static function parse(string $text): string
    {
        return <<<PROMPT
            Parse this natural-language job application log into structured fields.
            Input: "{$text}"

            Return JSON with: company, role, location (optional), url (optional), notes, jobDescription (if mentioned).
            PROMPT;
    }

    /** @return array<string, mixed> */
    public static function parseSchema(): array
    {
        return [
            'type' => 'OBJECT',
            'properties' => [
                'company' => ['type' => 'STRING'],
                'role' => ['type' => 'STRING'],
                'location' => ['type' => 'STRING'],
                'url' => ['type' => 'STRING'],
                'notes' => ['type' => 'STRING'],
                'jobDescription' => ['type' => 'STRING'],
            ],
            'required' => ['company', 'role'],
        ];
    }
}
