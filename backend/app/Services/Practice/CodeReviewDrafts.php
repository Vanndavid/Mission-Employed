<?php

namespace App\Services\Practice;

use App\Enums\CodeReviewCategory;
use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;
use Illuminate\Validation\Rule;

/**
 * AI drafts of code review snippets: {language, difficulty} in, a snippet
 * with its planted issues out, checked by {@see CodeReviewDraftValidator}
 * (the seed files' rules).
 *
 * A planted issue's lines decide which comments are put to the grader as
 * candidates for it, so a range one line out turns a right comment into a
 * miss, and models are poor at counting lines. Two things guard against
 * that. The model writes the code as a list of lines, as the seed files
 * hold it, so line n is the nth string. And it copies the text of each
 * range's first and last lines beside the numbers; draftErrors() refuses an
 * issue whose numbers do not land on the lines it quoted, read from the code
 * exactly as the viewer numbers it.
 *
 * As with the quiz, the model echoes the language so a drifted draft is
 * caught, and the difficulty is the request's.
 */
final class CodeReviewDrafts implements DraftKind
{
    private const DIFFICULTY_GUIDE = [
        'easy' => 'problems a junior developer should catch: an obvious bug, a missing check, input pasted into a query',
        'medium' => 'problems that get past developers with a year or two of experience: edge cases, error handling, needless work in a loop',
        'hard' => 'subtle problems experienced reviewers miss: races, leaked resources, behaviour at the boundaries, cost under load',
    ];

    /** How much of a line a refusal quotes. */
    private const QUOTE_PREVIEW = 60;

    public function __construct(private readonly CodeReviewDraftValidator $validator) {}

    public function kind(): PracticeKind
    {
        return PracticeKind::CodeReview;
    }

    public function rules(array $input): array
    {
        return [
            'language' => ['required', 'string', Rule::in(PracticeLanguage::values())],
            'difficulty' => ['required', 'string', Rule::in(PracticeQuestion::DIFFICULTIES)],
        ];
    }

    public function pinned(array $request): array
    {
        return ['language' => $request['language']];
    }

    public function prompt(array $request, int $count, array $existing): string
    {
        $language = PracticeLanguage::from($request['language']);
        $difficulty = $request['difficulty'];
        $level = self::DIFFICULTY_GUIDE[$difficulty];
        $plural = $count === 1 ? 'exercise' : 'exercises';
        $minLines = CodeReviewItemValidator::MIN_LINES;
        $maxLines = CodeReviewItemValidator::MAX_LINES;
        $minIssues = CodeReviewItemValidator::MIN_ISSUES;
        $maxIssues = CodeReviewItemValidator::MAX_ISSUES;
        $maxSpan = CodeReviewItemValidator::MAX_SPAN;
        $maxTitle = CodeReviewItemValidator::MAX_TITLE;
        $categories = implode(', ', CodeReviewCategory::values());
        $bank = $existing === []
            ? '(none yet)'
            : implode("\n", array_map(fn (string $line) => "- {$line}", $existing));

        return <<<PROMPT
            Write {$count} code review {$plural} for software engineers practising {$language->label()}.

            Each exercise is a short snippet that a reviewer reads as they would a pull request, with
            {$minIssues} to {$maxIssues} problems planted in it on purpose. The reviewer comments on lines, and is
            scored on which planted problems their comments find, so every problem's line numbers must
            be exact.

            Difficulty: {$difficulty}, meaning {$level}.

            For each exercise:
            - "language": exactly "{$language->value}".
            - "title": a name for the snippet, at most {$maxTitle} characters, such as "One page of a user's orders".
            - "prompt": one to three sentences on what the code is meant to do, and what the reviewer needs
              to know about anything it calls that is not shown. Never hint at the problems.
            - "code": the snippet as a list of lines, one string per line, so the first string is line 1.
              {$minLines} to {$maxLines} lines, usually 25 to 50. A blank line is an empty string and counts as a line.
              Indent with spaces, never tabs. No Markdown fences, no line numbers, and no comments that
              point at the problems. Realistic code that mostly works, in the language's current stable
              version.
            - "issues": the planted problems, each with:
              - "id": a short lowercase slug, unique in the snippet, such as "sql-injection";
              - "lines": [start, end], the first and last line the problem is on, counted from 1 in
                "code"; at most {$maxSpan} lines, and starting and ending on a line with code, not a blank one;
              - "firstLine" and "lastLine": the text of line start and of line end, copied character for
                character from "code", so the numbers can be checked;
              - "category": one of {$categories};
              - "severity": 1 (minor), 2, or 3 (serious: wrong results, lost data or a security hole);
              - "summary": what is wrong and what it causes, in one or two sentences;
              - "fix": how to fix it, in one or two sentences.
            - "explanation": the takeaway shown after the review is scored, two or three sentences on how
              to spot problems like these.

            Be certain of every problem: trace the code before you plant it, make sure it is visible from
            the snippet alone, and count the lines again before you give its numbers. Mix the
            categories, and make each exercise different from the others.

            Already in the bank for this language, so do not repeat them:
            {$bank}
            PROMPT;
    }

    public function schema(): array
    {
        $string = ['type' => 'STRING'];
        $issueFields = ['id', 'lines', 'firstLine', 'lastLine', 'category', 'severity', 'summary', 'fix'];

        return [
            'type' => 'OBJECT',
            'properties' => [
                'questions' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'language' => $string,
                            'title' => $string,
                            'prompt' => $string,
                            'code' => ['type' => 'ARRAY', 'items' => $string],
                            'issues' => [
                                'type' => 'ARRAY',
                                'items' => [
                                    'type' => 'OBJECT',
                                    'properties' => [
                                        'id' => $string,
                                        'lines' => ['type' => 'ARRAY', 'items' => ['type' => 'INTEGER']],
                                        'firstLine' => $string,
                                        'lastLine' => $string,
                                        'category' => ['type' => 'STRING', 'enum' => CodeReviewCategory::values()],
                                        'severity' => ['type' => 'INTEGER'],
                                        'summary' => $string,
                                        'fix' => $string,
                                    ],
                                    'required' => $issueFields,
                                ],
                            ],
                            'explanation' => $string,
                        ],
                        'required' => ['language', 'title', 'prompt', 'code', 'issues', 'explanation'],
                    ],
                ],
            ],
            'required' => ['questions'],
        ];
    }

    public function fromModel(array $item, array $request): array
    {
        $code = $item['code'] ?? null;
        if (is_array($code)) {
            // One string per line, as asked; anything else in the list is no code.
            $code = array_is_list($code) && array_filter($code, fn (mixed $line) => ! is_string($line)) === []
                ? implode("\n", $code)
                : null;
        }

        return [
            'language' => $item['language'] ?? null,
            'topic' => $item['title'] ?? null,
            'difficulty' => $request['difficulty'],
            'prompt' => $item['prompt'] ?? null,
            'code' => $code,
            'answer' => ['issues' => $item['issues'] ?? null],
            'explanation' => $item['explanation'] ?? null,
        ];
    }

    /**
     * Every planted issue's range lands on the lines the model quoted for it,
     * in the code as stored, which is the code as the viewer numbers it. The
     * question has passed the validator, so its issues are the item's, in
     * the model's order, each with a range inside the snippet.
     */
    public function draftErrors(array $item, array $question): array
    {
        $lines = CodeReviewItemValidator::lines((string) $question['code']);
        $said = is_array($item['issues'] ?? null) ? array_values($item['issues']) : [];
        $errors = [];

        foreach ($question['answer']['issues'] as $i => $issue) {
            $quoted = is_array($said[$i] ?? null) ? $said[$i] : [];
            [$start, $end] = $issue['lines'];

            foreach (['firstLine' => [$start, 'starts'], 'lastLine' => [$end, 'ends']] as $field => [$number, $verb]) {
                $quote = self::squash($quoted[$field] ?? null);
                $actual = self::squash($lines[$number - 1] ?? '');

                if ($quote === '') {
                    $errors[] = "Issue {$issue['id']}: the AI did not quote the line it {$verb} on, so lines [{$start}, {$end}] cannot be checked.";
                    break;
                }
                if (! str_contains($actual, $quote)) {
                    $errors[] = "Issue {$issue['id']} {$verb} on line {$number}, \"".self::preview($actual).'", but the AI quoted "'
                        .self::preview($quote).'" for it, so its line numbers are off.';
                    break;
                }
            }
        }

        return $errors;
    }

    public function validator(): DraftValidator
    {
        return $this->validator;
    }

    private static function squash(mixed $text): string
    {
        return is_string($text) ? trim((string) preg_replace('/\s+/u', ' ', $text)) : '';
    }

    private static function preview(string $text): string
    {
        return mb_strimwidth($text, 0, self::QUOTE_PREVIEW, '…');
    }
}
