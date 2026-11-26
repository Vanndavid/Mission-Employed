<?php

namespace Tests\Unit;

use App\Services\Practice\CodeReviewScorer;
use PHPUnit\Framework\TestCase;

/**
 * The code review score is computed, not generated: the model only says
 * which comments identify which planted issue and how good the suggested fix
 * is, and this decides the number. Out of 100: detection 70 (by severity),
 * fix quality 20, precision 10.
 */
class CodeReviewScorerTest extends TestCase
{
    private CodeReviewScorer $scorer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->scorer = new CodeReviewScorer;
    }

    /** @return list<array{id: string, severity: int}> */
    private function issues(int ...$severities): array
    {
        return array_map(
            fn (int $severity, int $i) => ['id' => "issue-{$i}", 'severity' => $severity],
            $severities,
            array_keys($severities),
        );
    }

    /**
     * @param  array<string, array{comments: list<int>, fix: string|null}>  $issues
     * @param  list<int>  $bonus
     * @return array{issues: array<string, array{comments: list<int>, fix: string|null}>, bonus: list<array{comment: int, note: string}>}
     */
    private function judgement(array $issues, array $bonus = []): array
    {
        return [
            'issues' => $issues,
            'bonus' => array_map(fn (int $comment) => ['comment' => $comment, 'note' => 'A fair point.'], $bonus),
        ];
    }

    public function test_finding_everything_with_the_right_fixes_scores_full_marks(): void
    {
        $result = $this->scorer->score($this->issues(3, 2, 1), $this->judgement([
            'issue-0' => ['comments' => [0], 'fix' => 'yes'],
            'issue-1' => ['comments' => [1], 'fix' => 'yes'],
            'issue-2' => ['comments' => [2], 'fix' => 'yes'],
        ]), 3);

        $this->assertSame(100, $result['score']);
        $this->assertSame(100, $result['maxScore']);
        $this->assertSame(['points' => 70, 'max' => 70, 'found' => 3, 'total' => 3, 'severityFound' => 6, 'severityTotal' => 6], $result['breakdown']['detection']);
        $this->assertSame(['points' => 20, 'max' => 20], $result['breakdown']['fixes']);
        $this->assertSame(['points' => 10, 'max' => 10, 'useful' => 3, 'comments' => 3], $result['breakdown']['precision']);
    }

    public function test_finding_nothing_scores_zero(): void
    {
        $issues = $this->issues(3, 2);
        $nothing = $this->judgement([
            'issue-0' => ['comments' => [], 'fix' => null],
            'issue-1' => ['comments' => [], 'fix' => null],
        ]);

        // Comments that hit nothing, and no comments at all.
        $this->assertSame(0, $this->scorer->score($issues, $nothing, 4)['score']);
        $this->assertSame(0, $this->scorer->score($issues, $nothing, 0)['score']);
        $this->assertSame(0, $this->scorer->score($issues, $this->judgement([]), 0)['score']);
    }

    public function test_detection_is_weighted_by_severity(): void
    {
        $issues = $this->issues(3, 1);

        $severe = $this->scorer->score($issues, $this->judgement([
            'issue-0' => ['comments' => [0], 'fix' => 'no'],
            'issue-1' => ['comments' => [], 'fix' => null],
        ]), 1);
        $minor = $this->scorer->score($issues, $this->judgement([
            'issue-0' => ['comments' => [], 'fix' => null],
            'issue-1' => ['comments' => [0], 'fix' => 'no'],
        ]), 1);

        // 70 x 3/4 and 70 x 1/4; one issue found either way.
        $this->assertSame(53, $severe['breakdown']['detection']['points']);
        $this->assertSame(18, $minor['breakdown']['detection']['points']);
        $this->assertSame(1, $severe['breakdown']['detection']['found']);
        $this->assertSame(1, $minor['breakdown']['detection']['found']);
        $this->assertSame(0, $severe['breakdown']['fixes']['points']);
    }

    public function test_fix_quality_counts_partial_fixes_as_half_and_missed_issues_as_none(): void
    {
        $result = $this->scorer->score($this->issues(2, 2, 2, 2), $this->judgement([
            'issue-0' => ['comments' => [0], 'fix' => 'yes'],
            'issue-1' => ['comments' => [1], 'fix' => 'partial'],
            'issue-2' => ['comments' => [2], 'fix' => 'no'],
            'issue-3' => ['comments' => [], 'fix' => null],
        ]), 3);

        // (1 + 0.5 + 0 + 0) / 4 of 20.
        $this->assertSame(8, $result['breakdown']['fixes']['points']);
        $this->assertSame(53, $result['breakdown']['detection']['points']);
    }

    public function test_a_fix_verdict_on_an_issue_nobody_found_earns_nothing(): void
    {
        $result = $this->scorer->score($this->issues(2, 2), $this->judgement([
            'issue-0' => ['comments' => [], 'fix' => 'yes'],
            'issue-1' => ['comments' => [], 'fix' => 'yes'],
        ]), 1);

        $this->assertSame(0, $result['score']);
    }

    public function test_comments_that_match_nothing_cost_precision(): void
    {
        $issues = $this->issues(2, 2);
        $found = [
            'issue-0' => ['comments' => [0], 'fix' => 'yes'],
            'issue-1' => ['comments' => [1], 'fix' => 'yes'],
        ];

        $tidy = $this->scorer->score($issues, $this->judgement($found), 2);
        $sprayed = $this->scorer->score($issues, $this->judgement($found), 8);

        $this->assertSame(100, $tidy['score']);
        // Two useful comments of eight.
        $this->assertSame(['points' => 3, 'max' => 10, 'useful' => 2, 'comments' => 8], $sprayed['breakdown']['precision']);
        $this->assertSame(93, $sprayed['score']);
    }

    public function test_a_valid_point_outside_the_planted_list_is_not_penalised(): void
    {
        $result = $this->scorer->score($this->issues(2, 2), $this->judgement([
            'issue-0' => ['comments' => [0], 'fix' => 'yes'],
            'issue-1' => ['comments' => [], 'fix' => null],
        ], bonus: [1]), 3);

        // Comment 2 matched nothing and was not judged valid.
        $this->assertSame(['points' => 7, 'max' => 10, 'useful' => 2, 'comments' => 3], $result['breakdown']['precision']);
    }

    public function test_one_comment_finding_two_issues_counts_once_for_precision(): void
    {
        $result = $this->scorer->score($this->issues(1, 1), $this->judgement([
            'issue-0' => ['comments' => [0], 'fix' => 'yes'],
            'issue-1' => ['comments' => [0], 'fix' => 'yes'],
        ]), 1);

        $this->assertSame(['points' => 10, 'max' => 10, 'useful' => 1, 'comments' => 1], $result['breakdown']['precision']);
        $this->assertSame(100, $result['score']);
    }

    public function test_the_parts_add_up_to_the_score_and_stay_in_bounds(): void
    {
        // Indexes past the comment count and unknown ids are the sanitiser's
        // to drop, but the score still cannot leave 0..100 or count them.
        $result = $this->scorer->score($this->issues(1, 3, 2), $this->judgement([
            'issue-0' => ['comments' => [0, 1, 2, 9, 10], 'fix' => 'yes'],
            'issue-1' => ['comments' => [3], 'fix' => 'partial'],
            'issue-2' => ['comments' => [11], 'fix' => 'yes'],
            'ghost' => ['comments' => [4], 'fix' => 'yes'],
        ], bonus: [5, 6, 7, 8]), 4);

        $parts = array_sum(array_column($result['breakdown'], 'points'));
        $this->assertSame($parts, $result['score']);
        $this->assertSame(47 + 8 + 10, $result['score']);
        $this->assertSame(['points' => 47, 'max' => 70, 'found' => 2, 'total' => 3, 'severityFound' => 4, 'severityTotal' => 6], $result['breakdown']['detection']);
        // (1 x 1 + 3 x 0.5) / 6 of 20.
        $this->assertSame(['points' => 8, 'max' => 20], $result['breakdown']['fixes']);
        $this->assertSame(['points' => 10, 'max' => 10, 'useful' => 4, 'comments' => 4], $result['breakdown']['precision']);
        $this->assertFalse($result['issues'][2]['found']);
    }

    public function test_the_score_never_leaves_zero_to_a_hundred(): void
    {
        $issues = $this->issues(3, 3);
        $everything = $this->judgement([
            'issue-0' => ['comments' => [0, 1], 'fix' => 'yes'],
            'issue-1' => ['comments' => [0, 1], 'fix' => 'yes'],
        ], bonus: [0, 1]);

        foreach ([0, 1, 2, 50] as $comments) {
            $score = $this->scorer->score($issues, $everything, $comments)['score'];
            $this->assertGreaterThanOrEqual(0, $score, "{$comments} comments");
            $this->assertLessThanOrEqual(100, $score, "{$comments} comments");
        }
        $this->assertSame(100, $this->scorer->score($issues, $everything, 2)['score']);
    }

    public function test_the_issues_come_back_in_order_marked_found_or_missed(): void
    {
        $result = $this->scorer->score($this->issues(3, 1), $this->judgement([
            'issue-1' => ['comments' => [1, 0], 'fix' => 'partial'],
        ]), 2);

        $this->assertSame([
            ['id' => 'issue-0', 'found' => false, 'comments' => [], 'fixVerdict' => null],
            ['id' => 'issue-1', 'found' => true, 'comments' => [0, 1], 'fixVerdict' => 'partial'],
        ], $result['issues']);
    }
}
