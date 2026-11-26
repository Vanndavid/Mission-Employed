<?php

namespace App\Services\Practice;

use App\Enums\CodeReviewCategory;
use App\Models\PracticeQuestion;

/**
 * Whether a code review snippet can be published, whoever wrote it. The seed
 * files go through it ({@see CodeReviewSeed}), and so do the admin bank's AI
 * drafts and every edit to them ({@see CodeReviewDraftValidator}): one set of
 * rules, so a hand-written snippet and a generated one are held to the same
 * standard.
 *
 * An item is one snippet:
 *
 *     {
 *       "title": "Paginate a user's orders",   at most 64 characters
 *       "difficulty": "medium",                easy | medium | hard
 *       "prompt": "What the code is meant to do.",
 *       "code": "…",                           20 to 80 lines, spaces not tabs
 *       "issues": [{                           2 to 6 planted issues
 *         "id": "sql-injection",               a slug, unique in the snippet
 *         "lines": [12, 14],                   1-based and inclusive, at most 15 lines,
 *                                              starting and ending on a line with code
 *         "category": "security",              a CodeReviewCategory
 *         "severity": 3,                       1 (minor) to 3 (serious)
 *         "summary": "What is wrong.",
 *         "fix": "How to fix it."
 *       }],
 *       "explanation": "The takeaway, shown after the review is scored."
 *     }
 *
 * A planted issue's lines decide which comments are put to the model as
 * candidates for it, so a range that is off by one turns a right comment
 * into a miss. That is why a range may not start or end on a blank line:
 * it has to point at the code.
 */
class CodeReviewItemValidator
{
    public const MIN_LINES = 20;

    public const MAX_LINES = 80;

    public const MIN_ISSUES = 2;

    public const MAX_ISSUES = 6;

    /** An issue is a few lines of the snippet, not the whole of it. */
    public const MAX_SPAN = 15;

    public const MIN_SEVERITY = 1;

    public const MAX_SEVERITY = 3;

    /** The width of practice_questions.topic, which holds the title. */
    public const MAX_TITLE = 64;

    public const MAX_ISSUE_ID = 48;

    /**
     * Everything wrong with one item; empty when it can be published.
     *
     * @param  array<mixed>  $item
     * @return list<string>
     */
    public function errors(array $item): array
    {
        $errors = [];

        if (! self::filled($item['title'] ?? null) || mb_strlen(trim($item['title'])) > self::MAX_TITLE) {
            $errors[] = 'needs a title of at most '.self::MAX_TITLE.' characters';
        }
        if (! in_array($item['difficulty'] ?? null, PracticeQuestion::DIFFICULTIES, true)) {
            $errors[] = 'difficulty must be one of '.implode(', ', PracticeQuestion::DIFFICULTIES);
        }
        if (! self::filled($item['prompt'] ?? null)) {
            $errors[] = 'needs a prompt saying what the code is meant to do';
        }
        if (! self::filled($item['explanation'] ?? null)) {
            $errors[] = 'needs an explanation, the takeaway shown after a review';
        }

        $code = $item['code'] ?? null;
        if (! self::filled($code)) {
            return [...$errors, 'needs the code, as text'];
        }

        $lines = self::lines($code);
        if (count($lines) < self::MIN_LINES || count($lines) > self::MAX_LINES) {
            $errors[] = 'code must be '.self::MIN_LINES.' to '.self::MAX_LINES.' lines, not '.count($lines);
        }
        if (str_contains($code, "\t") || str_contains($code, "\r")) {
            $errors[] = 'code must indent with spaces, with no tabs or carriage returns';
        }

        $issues = $item['issues'] ?? null;
        if (! is_array($issues) || ! array_is_list($issues) || count($issues) < self::MIN_ISSUES || count($issues) > self::MAX_ISSUES) {
            return [...$errors, 'needs a list of '.self::MIN_ISSUES.' to '.self::MAX_ISSUES.' issues'];
        }

        $seen = [];
        foreach ($issues as $i => $issue) {
            $where = 'issue #'.$i.(is_array($issue) && is_string($issue['id'] ?? null) ? " ({$issue['id']})" : '');

            if (! is_array($issue)) {
                $errors[] = "{$where} is not an object";

                continue;
            }

            foreach ($this->issueErrors($issue, $lines) as $error) {
                $errors[] = "{$where}: {$error}";
            }

            if (is_string($issue['id'] ?? null)) {
                if (isset($seen[$issue['id']])) {
                    $errors[] = "{$where}: the id is used more than once";
                }
                $seen[$issue['id']] = true;
            }
        }

        return $errors;
    }

    /**
     * The question's answer key from a valid item: its issues, trimmed, with
     * nothing else. Call errors() first.
     *
     * @param  array<mixed>  $item
     * @return array{issues: list<array{id: string, lines: array{int, int}, category: string, severity: int, summary: string, fix: string}>}
     */
    public function answer(array $item): array
    {
        return ['issues' => array_map(fn (array $issue) => [
            'id' => $issue['id'],
            'lines' => [$issue['lines'][0], $issue['lines'][1]],
            'category' => $issue['category'],
            'severity' => $issue['severity'],
            'summary' => trim($issue['summary']),
            'fix' => trim($issue['fix']),
        ], $item['issues'])];
    }

    /**
     * The snippet's lines as the viewer numbers them: a trailing newline does
     * not make a line of its own.
     *
     * @return list<string>
     */
    public static function lines(string $code): array
    {
        return explode("\n", rtrim($code, "\n"));
    }

    public static function lineCount(string $code): int
    {
        return count(self::lines($code));
    }

    /**
     * @param  array<mixed>  $issue
     * @param  list<string>  $lines
     * @return list<string>
     */
    private function issueErrors(array $issue, array $lines): array
    {
        $errors = [];

        $id = $issue['id'] ?? null;
        if (! is_string($id) || strlen($id) > self::MAX_ISSUE_ID || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $id) !== 1) {
            $errors[] = 'id must be a lowercase slug like "sql-injection"';
        }
        if (! in_array($issue['category'] ?? null, CodeReviewCategory::values(), true)) {
            $errors[] = 'category must be one of '.implode(', ', CodeReviewCategory::values());
        }
        $severity = $issue['severity'] ?? null;
        if (! is_int($severity) || $severity < self::MIN_SEVERITY || $severity > self::MAX_SEVERITY) {
            $errors[] = 'severity must be a whole number from '.self::MIN_SEVERITY.' to '.self::MAX_SEVERITY;
        }
        if (! self::filled($issue['summary'] ?? null)) {
            $errors[] = 'needs a summary of what is wrong';
        }
        if (! self::filled($issue['fix'] ?? null)) {
            $errors[] = 'needs a fix';
        }

        $range = $issue['lines'] ?? null;
        if (! is_array($range) || ! array_is_list($range) || count($range) !== 2 || ! is_int($range[0]) || ! is_int($range[1])) {
            return [...$errors, 'lines must be [start, end], two line numbers'];
        }

        [$start, $end] = $range;
        if ($start < 1 || $end < $start || $end > count($lines)) {
            return [...$errors, "lines [{$start}, {$end}] must fall inside the snippet's ".count($lines).' lines, start first'];
        }
        if ($end - $start + 1 > self::MAX_SPAN) {
            $errors[] = 'lines must span at most '.self::MAX_SPAN.' lines';
        }
        if (trim($lines[$start - 1]) === '' || trim($lines[$end - 1]) === '') {
            $errors[] = "lines [{$start}, {$end}] must start and end on a line with code, not a blank one";
        }

        return $errors;
    }

    private static function filled(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }
}
