<?php

namespace App\Services\Practice;

use App\Models\PracticeQuestion;
use App\Services\Ai\CodeReviewPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;

/**
 * Grades one code review of a snippet: one model call to match the comments
 * to the planted issues, then {@see CodeReviewScorer} for the number. The
 * AI matches, code scores.
 *
 * The model's answer is untrusted input and goes through
 * {@see self::sanitise()} first: an issue id that is not planted, a comment
 * index that does not exist and anything said twice are dropped, so a
 * confused or manipulated answer can only lose points, never invent them.
 *
 * The result is what practice_attempts.feedback stores: the breakdown, each
 * planted issue (copied whole, so the attempt still reads right if the
 * snippet is edited later) with whether it was found, the bonus findings and
 * the takeaway.
 *
 * @phpstan-import-type Judgement from CodeReviewScorer
 */
class CodeReviewGrader
{
    /** A bonus note is one sentence; anything longer is cut. */
    public const MAX_NOTE = 300;

    public function __construct(
        private readonly GeminiClient $gemini,
        private readonly CodeReviewScorer $scorer,
    ) {}

    /**
     * @param  list<array{line: int, body: string}>  $comments
     * @return array{score: int, maxScore: int, feedback: array<string, mixed>}
     *
     * @throws GeminiException
     */
    public function grade(PracticeQuestion $question, array $comments, ?string $summary): array
    {
        $issues = self::plantedIssues($question);
        $ids = array_column($issues, 'id');

        $answer = $this->gemini->generateJson(
            CodeReviewPrompts::review(
                $question->language?->label() ?? 'code',
                $question->topic,
                $question->prompt,
                (string) $question->code,
                $issues,
                $comments,
                $summary,
            ),
            CodeReviewPrompts::schema($ids),
        );

        $judgement = self::sanitise($answer, $ids, count($comments));
        $result = $this->scorer->score($issues, $judgement, count($comments));

        return [
            'score' => $result['score'],
            'maxScore' => $result['maxScore'],
            'feedback' => [
                'breakdown' => $result['breakdown'],
                'issues' => array_map(
                    fn (array $issue, array $verdict) => [...$issue, 'found' => $verdict['found'], 'comments' => $verdict['comments'], 'fixVerdict' => $verdict['fixVerdict']],
                    $issues,
                    $result['issues'],
                ),
                'bonus' => $judgement['bonus'],
                'takeaway' => $question->explanation,
            ],
        ];
    }

    /**
     * Keep only what the model was allowed to say: planted issue ids, once
     * each; comment indexes that exist, once each; a fix verdict from the
     * list (else "no"), and none for an issue no comment found; bonus
     * findings on comments that matched no issue, once each, with a short
     * plain-text note.
     *
     * @param  list<string>  $issueIds
     * @return Judgement
     */
    public static function sanitise(mixed $raw, array $issueIds, int $commentCount): array
    {
        $issues = [];
        $matched = [];

        foreach (self::items($raw, 'issues') as $item) {
            $id = $item['id'] ?? null;

            if (! is_string($id) || ! in_array($id, $issueIds, true) || isset($issues[$id])) {
                continue;
            }

            $comments = [];
            foreach (is_array($item['comments'] ?? null) ? $item['comments'] : [] as $index) {
                $index = self::index($index, $commentCount);
                if ($index !== null && ! in_array($index, $comments, true)) {
                    $comments[] = $index;
                    $matched[$index] = true;
                }
            }
            sort($comments);

            $fix = in_array($item['fix'] ?? null, CodeReviewPrompts::FIX_VERDICTS, true) ? $item['fix'] : 'no';
            $issues[$id] = ['comments' => $comments, 'fix' => $comments === [] ? null : $fix];
        }

        $bonus = [];
        foreach (self::items($raw, 'bonus') as $item) {
            $index = self::index($item['comment'] ?? null, $commentCount);

            if ($index === null || isset($matched[$index])) {
                continue;
            }

            $matched[$index] = true;
            $bonus[] = ['comment' => $index, 'note' => self::note($item['note'] ?? null)];
        }
        usort($bonus, fn (array $a, array $b) => $a['comment'] <=> $b['comment']);

        return ['issues' => $issues, 'bonus' => $bonus];
    }

    /**
     * The question's planted issues, as the seed validator shaped them.
     *
     * @return list<array{id: string, lines: array{int, int}, category: string, severity: int, summary: string, fix: string}>
     */
    public static function plantedIssues(PracticeQuestion $question): array
    {
        $issues = $question->answer['issues'] ?? [];

        return is_array($issues) ? array_values($issues) : [];
    }

    /** @return list<array<mixed>> */
    private static function items(mixed $raw, string $key): array
    {
        $items = is_array($raw) && is_array($raw[$key] ?? null) ? $raw[$key] : [];

        return array_values(array_filter($items, 'is_array'));
    }

    /** A comment index that exists, from an int or a string of digits. */
    private static function index(mixed $value, int $commentCount): ?int
    {
        if (is_string($value) && ctype_digit($value)) {
            $value = (int) $value;
        }

        return is_int($value) && $value >= 0 && $value < $commentCount ? $value : null;
    }

    private static function note(mixed $value): string
    {
        if (! is_string($value)) {
            return '';
        }

        $note = trim((string) preg_replace('/\s+/u', ' ', $value));

        return mb_strlen($note) > self::MAX_NOTE ? rtrim(mb_substr($note, 0, self::MAX_NOTE - 1)).'…' : $note;
    }
}
