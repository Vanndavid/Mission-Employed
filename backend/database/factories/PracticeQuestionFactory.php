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
}
