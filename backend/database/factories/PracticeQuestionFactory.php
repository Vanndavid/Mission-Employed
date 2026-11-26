<?php

namespace Database\Factories;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A published JavaScript quiz question by default, written by an admin, with
 * its first option as the key. Use withOptions() to set options and key
 * together so they cannot disagree.
 *
 * @extends Factory<PracticeQuestion>
 */
class PracticeQuestionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $options = array_map(
            fn (int $i) => "Option {$i} ".fake()->unique()->bothify('??##??'),
            [1, 2, 3, 4],
        );

        return [
            'kind' => PracticeKind::Quiz,
            'language' => PracticeLanguage::JavaScript,
            'topic' => 'scope',
            'difficulty' => fake()->randomElement(PracticeQuestion::DIFFICULTIES),
            'prompt' => 'What does this print? '.fake()->sentence(),
            'code' => 'console.log('.fake()->randomNumber(3).');',
            'options' => $options,
            'answer' => ['choice' => $options[0]],
            'explanation' => 'Because '.fake()->unique()->sentence(10),
            'status' => PracticeQuestionStatus::Published,
            'source' => PracticeQuestionSource::Admin,
            'external_id' => null,
        ];
    }

    public function draft(): static
    {
        return $this->state(fn (array $attributes) => ['status' => PracticeQuestionStatus::Draft]);
    }

    public function seeded(string $externalId): static
    {
        return $this->state(fn (array $attributes) => [
            'source' => PracticeQuestionSource::Seed,
            'external_id' => $externalId,
        ]);
    }

    /** @param  list<string>  $options */
    public function withOptions(array $options, string $answer): static
    {
        return $this->state(fn (array $attributes) => [
            'options' => $options,
            'answer' => ['choice' => $answer],
        ]);
    }

    /**
     * A 24-line JavaScript snippet to review, titled in `topic`, with two
     * planted issues: `sql-injection` (lines 3-4, severity 3) and
     * `off-by-one` (line 10, severity 1).
     */
    public function codeReview(): static
    {
        return $this->state(fn (array $attributes) => [
            'kind' => PracticeKind::CodeReview,
            'topic' => 'Snippet '.fake()->unique()->bothify('??##'),
            'prompt' => 'Returns one page of the signed-in user\'s orders.',
            'code' => implode("\n", array_map(fn (int $n) => "const line{$n} = {$n};", range(1, 24))),
            'options' => null,
            'answer' => ['issues' => [
                ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'The status is pasted into the SQL.', 'fix' => 'Bind it as a parameter.'],
                ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 1, 'summary' => 'Page 1 skips the first rows.', 'fix' => 'Offset by (page - 1) * size.'],
            ]],
            'explanation' => 'Check every value that reaches a query.',
        ]);
    }

    /** A system design scenario: no language, the title as topic, key points as the answer. */
    public function systemDesign(): static
    {
        return $this->state(fn (array $attributes) => [
            'kind' => PracticeKind::SystemDesign,
            'language' => null,
            'topic' => 'URL shortener '.fake()->unique()->numberBetween(1, 99999),
            'prompt' => 'Design a URL shortener for 100 million new links a month, with ten redirects for every link created.',
            'code' => null,
            'options' => null,
            'answer' => ['keyPoints' => [
                'requirements' => ['Separates creating a link from following one', 'Puts a number on redirect latency'],
                'estimation' => ['About 40 new links a second', 'About 3 TB over five years'],
                'api_data_model' => ['POST to create, GET to redirect', 'Links keyed by short code'],
                'architecture' => ['Separate read and write paths', 'A cache in front of the store'],
                'scalability' => ['Shard by short code', 'Cache hot redirects'],
                'reliability' => ['Weighs 301 against 302', 'Replicates the store'],
                'communication' => ['Traces one redirect end to end', 'Ties the read ratio to the cache'],
            ]],
            'explanation' => 'A read-heavy key-value problem: codes that never collide, and redirects served from a cache.',
        ]);
    }
}
