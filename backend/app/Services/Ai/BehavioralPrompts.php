<?php

namespace App\Services\Ai;

/**
 * Prompts and response schemas for one-question interview practice.
 *
 * Ported from `generateBehavioralPrompt` and `processAudioResponse` in
 * server/aiHandlers.js.
 */
class BehavioralPrompts
{
    public static function question(string $theme): string
    {
        return "Give me a realistic behavioral interview question for the theme: \"{$theme}\". Keep it brief and professional.";
    }

    /**
     * The evaluation prompt that accompanies the candidate's inline audio.
     *
     * The Node version asked for prose and then dug the pieces back out with
     * `text.split('###')` and a `TRANSCRIPT:` regex, which broke the moment the
     * model reworded a heading. The instructions are kept word for word; only
     * the "Return:" block now asks for JSON, decoded by
     * GeminiClient::generateJsonFromParts() against {@see self::evaluationSchema()}.
     *
     * @param  list<string>  $facts
     */
    public static function evaluation(string $prompt, string $theme, array $facts = []): string
    {
        $factsBlock = self::factsBlock($facts);

        return <<<PROMPT
            You are a Lead Recruiter.
            1. Transcribe the user's spoken answer to: "{$prompt}" (Theme: {$theme}).
            2. Provide a critical, professional STAR evaluation.
            3. Cross-reference the answer against the candidate's saved facts. Flag inconsistencies or missed opportunities to cite real examples.
            {$factsBlock}

            Return JSON with two fields:
            - "transcript": the transcription of the spoken answer.
            - "feedback": the evaluation as Markdown, using exactly these sections:

            ### 🎯 Execution Summary
            * [takeaways]

            ### ⚖️ Unbiased Critiques
            * [critiques — include fact-consistency check]

            ### 🚀 Training Directives
            * [adjustments]
            PROMPT;
    }

    /**
     * The Node SDK's `Type.OBJECT` / `Type.STRING` enum members are plain
     * strings over REST.
     *
     * @return array<string, mixed>
     */
    public static function evaluationSchema(): array
    {
        return [
            'type' => 'OBJECT',
            'properties' => [
                'transcript' => ['type' => 'STRING'],
                'feedback' => ['type' => 'STRING'],
            ],
            'required' => ['transcript', 'feedback'],
        ];
    }

    /** @param  list<string>  $facts */
    private static function factsBlock(array $facts): string
    {
        if ($facts === []) {
            return '';
        }

        $lines = implode("\n", array_map(static fn (string $fact) => "- {$fact}", $facts));

        return "\nCandidate's saved facts for this theme (use to check consistency and specificity):\n{$lines}\n";
    }
}
