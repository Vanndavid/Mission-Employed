<?php

namespace Tests\Unit;

use App\Services\Practice\SystemDesignRubric;
use PHPUnit\Framework\TestCase;

/**
 * The system design rubric is code: the gates, the weights and the sum are
 * decided here, and the model only rates the traits that pass the gates.
 */
class SystemDesignRubricTest extends TestCase
{
    /** @return array<string, string> */
    private function sections(array $overrides = []): array
    {
        return array_merge(array_fill_keys(array_keys(SystemDesignRubric::SECTIONS), ''), $overrides);
    }

    private function words(int $count): string
    {
        return implode(' ', array_fill(0, $count, 'word'));
    }

    /** @return array<string, array{score: int, evidence: string|null, improvement: string|null, covered: list<int>}> */
    private function judged(array $scores): array
    {
        return array_map(
            fn (int $score) => ['score' => $score, 'evidence' => null, 'improvement' => null, 'covered' => []],
            $scores,
        );
    }

    public function test_the_weights_add_up_to_one_hundred_in_whole_points(): void
    {
        $weights = array_column(SystemDesignRubric::TRAITS, 'weight');

        $this->assertSame(SystemDesignRubric::MAX_SCORE, array_sum($weights));
        foreach ($weights as $weight) {
            $this->assertSame(0, $weight % SystemDesignRubric::TRAIT_MAX, 'each score step must be a whole number of points');
        }
    }

    public function test_every_trait_has_a_descriptor_for_each_score_and_reads_known_sections(): void
    {
        $fed = [];

        foreach (SystemDesignRubric::TRAITS as $key => $trait) {
            $this->assertEqualsCanonicalizing(range(0, SystemDesignRubric::TRAIT_MAX), array_keys($trait['descriptors']), $key);
            foreach ($trait['descriptors'] as $descriptor) {
                $this->assertGreaterThan(30, mb_strlen($descriptor), "{$key} needs a written descriptor");
            }
            $this->assertNotSame([], $trait['sections'], $key);
            $this->assertSame([], array_diff($trait['sections'], array_keys(SystemDesignRubric::SECTIONS)), $key);
            $fed = [...$fed, ...$trait['sections']];
        }

        // Every section is scored by something.
        $this->assertEqualsCanonicalizing(array_keys(SystemDesignRubric::SECTIONS), array_values(array_unique($fed)));
        $this->assertSame('sd-1', SystemDesignRubric::VERSION);
    }

    public function test_words_are_runs_that_contain_a_letter_or_digit(): void
    {
        $this->assertSame(0, SystemDesignRubric::wordCount(''));
        $this->assertSame(0, SystemDesignRubric::wordCount("  \n - -> | "));
        $this->assertSame(4, SystemDesignRubric::wordCount('Shard by short code.'));
        $this->assertSame(4, SystemDesignRubric::wordCount("- 100M links/month\n- ~40 writes/s"));
    }

    public function test_a_trait_under_fifteen_words_is_gated(): void
    {
        $gated = SystemDesignRubric::gatedTraits($this->sections([
            'requirements' => $this->words(15),
            'estimates' => $this->words(14),
            // API and data model are one trait: their words count together.
            'api' => $this->words(8),
            'data_model' => $this->words(7),
            'high_level' => $this->words(3),
        ]));

        $this->assertSame(['estimation', 'architecture', 'scalability', 'reliability'], $gated);
        $this->assertSame(
            ['requirements', 'api_data_model', 'communication'],
            SystemDesignRubric::judgedTraits($this->sections([
                'requirements' => $this->words(15),
                'estimates' => $this->words(14),
                'api' => $this->words(8),
                'data_model' => $this->words(7),
                'high_level' => $this->words(3),
            ])),
        );
    }

    public function test_an_empty_answer_gates_every_trait(): void
    {
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), SystemDesignRubric::gatedTraits($this->sections()));
        $this->assertSame([], SystemDesignRubric::judgedTraits($this->sections()));
    }

    public function test_full_marks_sum_to_one_hundred_and_none_to_zero(): void
    {
        $this->assertSame(100, SystemDesignRubric::total(array_fill_keys(array_keys(SystemDesignRubric::TRAITS), 4)));
        $this->assertSame(0, SystemDesignRubric::total(array_fill_keys(array_keys(SystemDesignRubric::TRAITS), 0)));
        $this->assertSame(0, SystemDesignRubric::total([]));
    }

    public function test_each_trait_is_weighted_before_it_is_summed(): void
    {
        // requirements 12 × 3/4 = 9, estimation 12 × 2/4 = 6, API 16 × 4/4 = 16,
        // architecture 20 × 1/4 = 5, scalability 0, reliability 16 × 2/4 = 8,
        // communication 8 × 3/4 = 6.
        $this->assertSame(50, SystemDesignRubric::total([
            'requirements' => 3,
            'estimation' => 2,
            'api_data_model' => 4,
            'architecture' => 1,
            'scalability' => 0,
            'reliability' => 2,
            'communication' => 3,
        ]));

        $this->assertSame(15, SystemDesignRubric::points('architecture', 3));
        $this->assertSame(0, SystemDesignRubric::points('architecture', 0));
    }

    public function test_out_of_range_scores_never_reach_the_sum(): void
    {
        $this->assertSame(20, SystemDesignRubric::total(['architecture' => 9, 'unknown' => 4]));
        $this->assertSame(0, SystemDesignRubric::total(['architecture' => -3]));
    }

    public function test_the_report_applies_the_gates_and_splits_key_points(): void
    {
        $sections = $this->sections([
            'requirements' => $this->words(20),
            'estimates' => 'Forty writes a second.',
            'api' => $this->words(20),
            'data_model' => $this->words(20),
            'high_level' => $this->words(20),
            'deep_dive' => $this->words(20),
            'tradeoffs' => $this->words(20),
        ]);
        $keyPoints = array_map(fn (string $trait) => ["{$trait} one", "{$trait} two", "{$trait} three"], array_combine(
            array_keys(SystemDesignRubric::TRAITS),
            array_keys(SystemDesignRubric::TRAITS),
        ));

        $judged = $this->judged([
            'requirements' => 4,
            'api_data_model' => 2,
            'architecture' => 3,
            'scalability' => 1,
            'reliability' => 0,
            'communication' => 2,
        ]);
        $judged['requirements']['covered'] = [0, 2];
        $judged['requirements']['evidence'] = 'word word';
        $judged['requirements']['improvement'] = 'Name a latency target.';

        $report = SystemDesignRubric::report($sections, $keyPoints, $judged);

        $this->assertSame('sd-1', $report['rubricVersion']);
        $this->assertSame(100, $report['maxScore']);
        // 12 + 0 (gated) + 8 + 15 + 4 + 0 + 4
        $this->assertSame(43, $report['score']);
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_column($report['traits'], 'key'));

        $traits = array_column($report['traits'], null, 'key');

        $requirements = $traits['requirements'];
        $this->assertSame(4, $requirements['score']);
        $this->assertSame(4, $requirements['max']);
        $this->assertSame(12, $requirements['points']);
        $this->assertSame(12, $requirements['maxPoints']);
        $this->assertFalse($requirements['gated']);
        $this->assertSame(SystemDesignRubric::TRAITS['requirements']['descriptors'][4], $requirements['descriptor']);
        $this->assertSame('word word', $requirements['evidence']);
        $this->assertSame('Name a latency target.', $requirements['improvement']);
        $this->assertSame(['requirements one', 'requirements three'], $requirements['keyPoints']['covered']);
        $this->assertSame(['requirements two'], $requirements['keyPoints']['missed']);

        $estimation = $traits['estimation'];
        $this->assertTrue($estimation['gated']);
        $this->assertSame(0, $estimation['score']);
        $this->assertSame(0, $estimation['points']);
        $this->assertSame(4, $estimation['words']);
        $this->assertNull($estimation['evidence']);
        $this->assertStringContainsString('4 words', (string) $estimation['improvement']);
        $this->assertStringContainsString('15', (string) $estimation['improvement']);
        $this->assertSame([], $estimation['keyPoints']['covered']);
        $this->assertSame(['estimation one', 'estimation two', 'estimation three'], $estimation['keyPoints']['missed']);
    }

    public function test_a_gate_cannot_be_overruled_by_a_judgement(): void
    {
        $report = SystemDesignRubric::report(
            $this->sections(['requirements' => $this->words(20)]),
            [],
            $this->judged(['requirements' => 2, 'estimation' => 4, 'communication' => 1]),
        );

        $traits = array_column($report['traits'], null, 'key');
        $this->assertSame(0, $traits['estimation']['score']);
        $this->assertTrue($traits['estimation']['gated']);
        // 12 × 2/4 + 8 × 1/4
        $this->assertSame(8, $report['score']);
    }

    public function test_the_rubric_as_the_client_sees_it(): void
    {
        $rubric = SystemDesignRubric::present();

        $this->assertSame('sd-1', $rubric['version']);
        $this->assertSame(15, $rubric['minWords']);
        $this->assertSame(4, $rubric['traitMax']);
        $this->assertSame(100, $rubric['maxScore']);
        $this->assertSame(array_keys(SystemDesignRubric::SECTIONS), array_column($rubric['sections'], 'key'));
        $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_column($rubric['traits'], 'key'));
        $this->assertCount(5, $rubric['traits'][0]['descriptors']);
        $this->assertSame(['api', 'data_model'], $rubric['traits'][2]['sections']);
    }
}
