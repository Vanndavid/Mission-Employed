<?php

namespace Tests\Unit;

use App\Services\Practice\SystemDesignScorer;
use PHPUnit\Framework\TestCase;

/**
 * The model's ratings are untrusted input. Only the traits it was asked
 * about survive, scores are clamped to the scale, a quote has to be in the
 * answer, and key points are the scenario's own.
 */
class SystemDesignScorerTest extends TestCase
{
    private const ANSWER = "Shard the links table by short code.\nCache hot redirects in Redis with LRU eviction.";

    /** @var array<string, list<string>> */
    private const KEY_POINTS = [
        'scalability' => ['shard by short code', 'cache hot redirects', 'pre-allocate id ranges'],
        'architecture' => ['separate read and write paths', 'cache in front of the store'],
    ];

    /** @param  list<string>  $judged */
    private function sanitise(mixed $raw, array $judged = ['scalability', 'architecture']): array
    {
        return SystemDesignScorer::sanitise($raw, $judged, self::KEY_POINTS, self::ANSWER);
    }

    private function rating(array $overrides = []): array
    {
        return array_merge([
            'trait' => 'scalability',
            'score' => 3,
            'evidence' => 'Shard the links table by short code.',
            'improvement' => 'Say how a hot link is spread across replicas.',
            'keyPointsCovered' => [1, 2],
        ], $overrides);
    }

    public function test_a_well_formed_rating_comes_through(): void
    {
        $this->assertSame([
            'scalability' => [
                'score' => 3,
                'evidence' => 'Shard the links table by short code.',
                'improvement' => 'Say how a hot link is spread across replicas.',
                'covered' => [0, 1],
            ],
        ], $this->sanitise([$this->rating()]));
    }

    public function test_scores_are_clamped_to_the_scale(): void
    {
        $this->assertSame(4, $this->sanitise([$this->rating(['score' => 9])])['scalability']['score']);
        $this->assertSame(0, $this->sanitise([$this->rating(['score' => -2])])['scalability']['score']);
        $this->assertSame(3, $this->sanitise([$this->rating(['score' => 2.6])])['scalability']['score']);
        $this->assertSame(2, $this->sanitise([$this->rating(['score' => '2'])])['scalability']['score']);
    }

    public function test_a_rating_without_a_numeric_score_is_dropped(): void
    {
        $this->assertSame([], $this->sanitise([$this->rating(['score' => 'great'])]));
        $this->assertSame([], $this->sanitise([$this->rating(['score' => null])]));
    }

    public function test_a_quote_that_is_not_in_the_answer_is_dropped(): void
    {
        $rating = $this->sanitise([$this->rating(['evidence' => 'Use consistent hashing across shards.'])])['scalability'];

        $this->assertNull($rating['evidence']);
        $this->assertSame(3, $rating['score']);
    }

    public function test_a_quote_may_differ_from_the_answer_in_case_spacing_and_wrapping_quotes(): void
    {
        $quoted = $this->sanitise([$this->rating(['evidence' => '"cache hot redirects   in Redis"'])])['scalability'];
        $this->assertSame('cache hot redirects in Redis', $quoted['evidence']);

        $acrossLines = $this->sanitise([$this->rating(['evidence' => 'by short code. Cache hot'])])['scalability'];
        $this->assertSame('by short code. Cache hot', $acrossLines['evidence']);

        $this->assertNull($this->sanitise([$this->rating(['evidence' => '  '])])['scalability']['evidence']);
        $this->assertNull($this->sanitise([$this->rating(['evidence' => 42])])['scalability']['evidence']);
    }

    public function test_unknown_traits_and_traits_that_were_not_asked_about_are_ignored(): void
    {
        $ratings = $this->sanitise([
            $this->rating(['trait' => 'charisma']),
            $this->rating(['trait' => 'estimation', 'score' => 4]),
            $this->rating(['trait' => 'architecture', 'keyPointsCovered' => [2]]),
            'not a rating',
        ], ['scalability', 'architecture']);

        $this->assertSame(['architecture'], array_keys($ratings));
        $this->assertSame([1], $ratings['architecture']['covered']);
    }

    public function test_the_first_rating_of_a_trait_wins(): void
    {
        $ratings = $this->sanitise([$this->rating(['score' => 1]), $this->rating(['score' => 4])]);

        $this->assertSame(1, $ratings['scalability']['score']);
    }

    public function test_unknown_key_points_are_ignored(): void
    {
        $covered = $this->sanitise([$this->rating(['keyPointsCovered' => [3, 0, 4, 99, '2', 'one', 3, -1, 1.5]])])['scalability']['covered'];

        // 1-based in the prompt; 0-based here, each once, in order.
        $this->assertSame([1, 2], $covered);

        $this->assertSame([], $this->sanitise([$this->rating(['keyPointsCovered' => 'all of them'])])['scalability']['covered']);
    }

    public function test_an_improvement_is_trimmed_and_an_empty_one_is_null(): void
    {
        $this->assertSame('Add a cache.', $this->sanitise([$this->rating(['improvement' => "  Add a\n cache. "])])['scalability']['improvement']);
        $this->assertNull($this->sanitise([$this->rating(['improvement' => ''])])['scalability']['improvement']);
        $this->assertNull($this->sanitise([$this->rating(['improvement' => ['x']])])['scalability']['improvement']);
    }

    public function test_anything_but_a_list_of_ratings_is_nothing(): void
    {
        $this->assertSame([], $this->sanitise(null));
        $this->assertSame([], $this->sanitise('4/4'));
    }
}
