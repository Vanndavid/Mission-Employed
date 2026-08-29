<?php

namespace Database\Factories;

use App\Models\AiSession;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiSession>
 */
class AiSessionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'kind' => fake()->randomElement(AiSession::KINDS),
            'system_instruction' => fake()->paragraph(),
            'context' => ['topic' => fake()->word()],
            'report' => null,
        ];
    }

    public function kind(string $kind): static
    {
        return $this->state(fn (array $attributes) => ['kind' => $kind]);
    }

    public function withReport(): static
    {
        return $this->state(fn (array $attributes) => [
            'report' => [
                'score' => fake()->numberBetween(1, 10),
                'strengths' => [fake()->sentence()],
                'improvements' => [fake()->sentence()],
            ],
        ]);
    }
}
