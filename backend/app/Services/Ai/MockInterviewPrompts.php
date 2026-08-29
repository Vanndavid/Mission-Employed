<?php

namespace App\Services\Ai;

use App\Models\AiMessage;

/**
 * Prompts and response schemas for the full mock interview.
 *
 * Ported from `conductInterviewTurn` and `generateMockReport` in
 * server/aiHandlers.js. The Node version had no chat session for the mock — it
 * re-sent the whole transcript inside a single prompt on every turn, because it
 * needed a JSON reply. That structure is kept: the turn goes through
 * generateJsonFromParts(), not chat(). What changes is where the transcript
 * comes from, which is now the ai_messages table instead of the client.
 */
class MockInterviewPrompts
{
    /**
     * The persona header, stored as the session's system_instruction so every
     * later turn rebuilds a byte-identical prompt from the row rather than from
     * whatever the client happens to send.
     *
     * @param  array<string, mixed>|null  $companyContext
     */
    public static function interviewerInstruction(?array $companyContext): string
    {
        return 'You are a Senior Recruiter conducting a behavioral interview.'.self::contextBlock($companyContext);
    }

    /**
     * @param  string  $instruction  {@see self::interviewerInstruction()}
     * @param  string  $historyText  {@see self::transcript()}
     */
    public static function turn(string $instruction, string $historyText, bool $hasAudio): string
    {
        $transcribe = $hasAudio ? 'First, transcribe the user audio.' : '';

        return <<<PROMPT
            {$instruction}
            {$transcribe}

            Interview History:
            {$historyText}

            LOGIC:
            1. Assess the latest answer.
            2. If there is a "big hole" (missing STAR components, vague actions, no clear result), ask a specific follow-up.
            3. If the answer is solid, acknowledge briefly and move to a new topic.

            RESPONSE FORMAT (JSON):
            { "transcript": "...", "nextPrompt": "..." }
            PROMPT;
    }

    /** @return array<string, mixed> */
    public static function turnSchema(): array
    {
        return [
            'type' => 'OBJECT',
            'properties' => [
                'transcript' => ['type' => 'STRING'],
                'nextPrompt' => ['type' => 'STRING'],
            ],
            'required' => ['transcript', 'nextPrompt'],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $companyContext
     * @param  string  $historyText  {@see self::transcript()}
     */
    public static function report(?array $companyContext, string $historyText): string
    {
        $contextBlock = self::reportContextBlock($companyContext);

        return <<<PROMPT
            Analyze this behavioral mock interview transcript and produce a hiring decision report.
            {$contextBlock}

            Transcript:
            {$historyText}

            Structure:
            1. **FINAL VERDICT** (Hire / No Hire / Borderline)
            2. **NARRATIVE CONSISTENCY** (did answers align with stated facts?)
            3. **CRITICAL GAPS** (STAR holes, vagueness, missing metrics)
            4. **STRENGTHS**
            5. **ELITE ADJUSTMENTS** (specific improvements before real interview)
            PROMPT;
    }

    /**
     * Render stored turns the way the Node handlers did. The two speaker
     * labels differ between the turn prompt ("User") and the report
     * ("Candidate"); that difference is in the original and is preserved.
     *
     * @param  iterable<AiMessage>  $messages
     */
    public static function transcript(iterable $messages, string $candidateLabel = 'User'): string
    {
        $lines = [];

        foreach ($messages as $message) {
            $label = $message->role === 'user' ? $candidateLabel : 'Interviewer';
            $lines[] = "{$label}: {$message->content}";
        }

        return implode("\n", $lines);
    }

    /** @param  array<string, mixed>|null  $context */
    private static function contextBlock(?array $context): string
    {
        if (! $context) {
            return '';
        }

        return "\nCompany: ".self::field($context, 'company').
            "\nRole: ".self::field($context, 'role').
            "\nJD: ".self::field($context, 'jobDescription').
            "\nCandidate facts: ".self::field($context, 'facts')."\n";
    }

    /** @param  array<string, mixed>|null  $context */
    private static function reportContextBlock(?array $context): string
    {
        if (! $context) {
            return '';
        }

        return "\nCompany: ".self::field($context, 'company').
            "\nRole: ".self::field($context, 'role').
            "\nJD: ".self::field($context, 'jobDescription').
            "\nFacts: ".self::field($context, 'facts')."\n";
    }

    /** @param  array<string, mixed>  $context */
    private static function field(array $context, string $key): string
    {
        $value = $context[$key] ?? '';

        return is_scalar($value) ? (string) $value : '';
    }
}
