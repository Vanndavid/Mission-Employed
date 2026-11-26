<?php

namespace App\Services\Practice;

/**
 * Scores a code review against the issues planted in its snippet. A pure
 * function: the same planted issues, judgement and comment count always give
 * the same score.
 *
 * Same split as the ATS check ({@see \App\Services\Ats\AtsScorer}): the model
 * only says which of the user's comments identify which planted issue, and
 * whether the fix they suggest is right ({@see CodeReviewGrader}). This
 * class decides the number, out of 100:
 *
 *  - detection, 70: the severity of the issues found over the severity of
 *    them all, so missing a 3 costs three times what missing a 1 does;
 *  - fix quality, 20: severity-weighted again, a right fix earning the whole
 *    of an issue's share, a partial one half, and a missed issue nothing;
 *  - precision, 10: the share of comments that found a planted issue or were
 *    judged a valid point of their own, so spraying comments does not pay.
 *
 * Each part is rounded on its own and the score is their sum, so the
 * breakdown a user sees always adds up.
 *
 * @phpstan-type Judgement array{
 *     issues: array<string, array{comments: list<int>, fix: string|null}>,
 *     bonus: list<array{comment: int, note: string}>,
 * }
 */
class CodeReviewScorer
{
    /** Stored on every attempt scored this way. Change it when the weights change. */
    public const RUBRIC_VERSION = 'cr-1';

    public const MAX_SCORE = 100;

    public const DETECTION_POINTS = 70;

    public const FIX_POINTS = 20;

    public const PRECISION_POINTS = 10;

    /** What a suggested fix earns of its issue's share. */
    public const FIX_CREDIT = ['yes' => 1.0, 'partial' => 0.5, 'no' => 0.0];

    /**
     * @param  list<array{id: string, severity: int}>  $issues  the planted issues, in order
     * @param  Judgement  $judgement  sanitised; an issue missing from it was not found
     * @param  int  $commentCount  how many comments the review had
     * @return array{
     *     score: int,
     *     maxScore: int,
     *     breakdown: array{
     *         detection: array{points: int, max: int, found: int, total: int, severityFound: int, severityTotal: int},
     *         fixes: array{points: int, max: int},
     *         precision: array{points: int, max: int, useful: int, comments: int},
     *     },
     *     issues: list<array{id: string, found: bool, comments: list<int>, fixVerdict: string|null}>,
     * }
     */
    public function score(array $issues, array $judgement, int $commentCount): array
    {
        $commentCount = max(0, $commentCount);
        $inRange = fn (mixed $index) => is_int($index) && $index >= 0 && $index < $commentCount;

        $severityTotal = 0;
        $severityFound = 0;
        $fixCredit = 0.0;
        $found = 0;
        $useful = [];
        $verdicts = [];

        foreach ($issues as $issue) {
            $severity = max(0, (int) $issue['severity']);
            $judged = $judgement['issues'][$issue['id']] ?? null;
            $comments = array_values(array_unique(array_filter($judged['comments'] ?? [], $inRange)));
            sort($comments);

            $severityTotal += $severity;
            $isFound = $comments !== [];
            $verdict = null;

            if ($isFound) {
                $found++;
                $severityFound += $severity;
                $verdict = array_key_exists($judged['fix'] ?? '', self::FIX_CREDIT) ? $judged['fix'] : 'no';
                $fixCredit += $severity * self::FIX_CREDIT[$verdict];

                foreach ($comments as $index) {
                    $useful[$index] = true;
                }
            }

            $verdicts[] = ['id' => $issue['id'], 'found' => $isFound, 'comments' => $comments, 'fixVerdict' => $verdict];
        }

        foreach ($judgement['bonus'] ?? [] as $bonus) {
            if ($inRange($bonus['comment'] ?? null)) {
                $useful[$bonus['comment']] = true;
            }
        }

        $detection = $this->points(self::DETECTION_POINTS, $severityFound, $severityTotal);
        $fixes = $this->points(self::FIX_POINTS, $fixCredit, $severityTotal);
        $precision = $this->points(self::PRECISION_POINTS, count($useful), $commentCount);

        return [
            'score' => $detection + $fixes + $precision,
            'maxScore' => self::MAX_SCORE,
            'breakdown' => [
                'detection' => [
                    'points' => $detection,
                    'max' => self::DETECTION_POINTS,
                    'found' => $found,
                    'total' => count($issues),
                    'severityFound' => $severityFound,
                    'severityTotal' => $severityTotal,
                ],
                'fixes' => ['points' => $fixes, 'max' => self::FIX_POINTS],
                'precision' => [
                    'points' => $precision,
                    'max' => self::PRECISION_POINTS,
                    'useful' => count($useful),
                    'comments' => $commentCount,
                ],
            ],
            'issues' => $verdicts,
        ];
    }

    /** $max times the share, rounded, and never outside 0..$max. */
    private function points(int $max, float|int $part, float|int $whole): int
    {
        if ($whole <= 0) {
            return 0;
        }

        return (int) max(0, min($max, round($max * $part / $whole)));
    }
}
