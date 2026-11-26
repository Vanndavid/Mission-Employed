<?php

namespace Tests\Feature;

use App\Models\PracticeQuestion;
use App\Services\Practice\SystemDesignItemValidator;
use App\Services\Practice\SystemDesignRubric;
use Tests\TestCase;

/**
 * The hand-written system design scenarios in
 * resources/practice/system_design, read straight from the files.
 *
 * The key points are what the model checks an answer against, so a trait
 * with one key point (or none) would make "covered" all or nothing. Each
 * trait needs at least two.
 */
class PracticeSystemDesignContentTest extends TestCase
{
    /** @return array<string, array<string, mixed>> */
    private function files(): array
    {
        $files = [];
        foreach (glob(resource_path('practice/system_design/*.json')) as $path) {
            $data = json_decode((string) file_get_contents($path), true);
            $this->assertIsArray($data, basename($path).' is not valid JSON');
            $files[basename($path, '.json')] = $data;
        }

        return $files;
    }

    public function test_there_are_eight_to_ten_scenarios_across_every_difficulty(): void
    {
        $files = $this->files();

        $this->assertGreaterThanOrEqual(8, count($files));
        $this->assertLessThanOrEqual(10, count($files));
        $this->assertEqualsCanonicalizing(
            PracticeQuestion::DIFFICULTIES,
            array_values(array_unique(array_column($files, 'difficulty'))),
        );
    }

    public function test_every_trait_of_every_scenario_has_at_least_two_key_points(): void
    {
        foreach ($this->files() as $name => $scenario) {
            $this->assertSame(array_keys(SystemDesignRubric::TRAITS), array_keys($scenario['keyPoints'] ?? []), "{$name}: traits in rubric order");

            foreach ($scenario['keyPoints'] as $trait => $points) {
                $this->assertGreaterThanOrEqual(2, count($points), "{$name}: {$trait}");
            }
        }
    }

    public function test_every_scenario_is_well_formed(): void
    {
        $titles = [];

        foreach ($this->files() as $name => $scenario) {
            // The file is named after the id, which is stable forever.
            $this->assertSame("sd-{$name}", $scenario['id'] ?? null, "{$name}.json");
            $this->assertMatchesRegularExpression('/^sd-[a-z0-9]+(-[a-z0-9]+)*$/', $scenario['id']);
            $this->assertArrayNotHasKey('language', $scenario, "{$name}: system design has no language");

            $item = $scenario;
            unset($item['id']);
            $this->assertSame([], SystemDesignItemValidator::errors($item), "{$name}.json");

            // Scale numbers are the point of the scenario.
            $this->assertGreaterThanOrEqual(2, preg_match_all('/\d[\d,.]*/', $scenario['prompt']), "{$name}: needs scale numbers");
            $this->assertArrayNotHasKey(mb_strtolower($scenario['title']), $titles, "{$name}: repeats a title");
            $titles[mb_strtolower($scenario['title'])] = true;

            foreach ($scenario['keyPoints'] as $trait => $points) {
                foreach ($points as $point) {
                    $this->assertSame(trim($point), $point, "{$name}: {$trait} has stray spaces");
                    $this->assertStringEndsNotWith('.', $point, "{$name}: {$trait} key points are phrases, without a full stop");
                }
            }
        }
    }
}
