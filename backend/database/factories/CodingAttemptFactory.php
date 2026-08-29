<?php

namespace Database\Factories;

use App\Models\CodingAttempt;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CodingAttempt>
 */
class CodingAttemptFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->unique()->sentence(3),
            'difficulty' => fake()->randomElement(CodingAttempt::DIFFICULTIES),
            'topics' => fake()->randomElements(
                ['arrays', 'hash maps', 'graphs', 'dynamic programming', 'concurrency', 'testing', 'refactoring'],
                2
            ),
            'completed' => fake()->boolean(70),
            'attempted_at' => fake()->dateTimeBetween('-2 months', 'now'),
        ];
    }

    public function completed(): static
    {
        return $this->state(fn (array $attributes) => ['completed' => true]);
    }
}
