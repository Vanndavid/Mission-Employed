<?php

namespace App\Services\Ai;

/**
 * Prompts and response schemas for coding practice.
 *
 * Ported from `generateCodingProblem` and `createCodingSession` in
 * server/aiHandlers.js. The wording is verbatim; only the template-literal
 * indentation the Node file happened to carry has been dropped.
 */
class CodingPrompts
{
    /** @var list<string> */
    public const DIFFICULTIES = ['easy', 'medium', 'hard'];

    public const DEFAULT_DIFFICULTY = 'easy';

    public static function problem(string $difficulty): string
    {
        return <<<PROMPT
            Generate a programming problem for interview practice.
            Difficulty: {$difficulty}.
            Topics: Arrays, Strings, Hash Maps, Trees, Graphs, SQL, or Dynamic Programming as appropriate.
            Format: Return as JSON with title, description, examples, and topics (array of topic labels).
            PROMPT;
    }

    /**
     * The Node SDK's `Type.OBJECT` / `Type.STRING` enum members are plain
     * strings over REST.
     *
     * @return array<string, mixed>
     */
    public static function problemSchema(): array
    {
        return [
            'type' => 'OBJECT',
            'properties' => [
                'title' => ['type' => 'STRING'],
                'description' => ['type' => 'STRING'],
                'examples' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'topics' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
            ],
            'required' => ['title', 'description', 'examples', 'topics'],
        ];
    }

    /** The tutor persona, stored on the session and replayed on every turn. */
    public static function tutorInstruction(string $problemTitle, string $problemDescription): string
    {
        return <<<PROMPT
            You are a world-class technical interviewer and mentor.
            Your goal is to guide the student to solve the problem: "{$problemTitle}".
            Problem Description: {$problemDescription}

            RULES:
            1. Do NOT give the full solution immediately.
            2. If the student is stuck, provide a small hint or ask a Socratic question.
            3. Evaluate code for time/space complexity.
            4. Be rigorous but encouraging.
            5. Use Markdown for code blocks.
            6. Once they solve it optimally, provide a final "Mission Accomplished" summary.
            PROMPT;
    }
}
