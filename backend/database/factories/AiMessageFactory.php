<?php

namespace Database\Factories;

use App\Models\AiMessage;
use App\Models\AiSession;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiMessage>
 */
class AiMessageFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'ai_session_id' => AiSession::factory(),
            'role' => fake()->randomElement(AiMessage::ROLES),
            'content' => fake()->paragraph(),
            'sequence' => fake()->numberBetween(1, 20),
        ];
    }

    public function fromUser(): static
    {
        return $this->state(fn (array $attributes) => ['role' => 'user']);
    }

    public function fromModel(): static
    {
        return $this->state(fn (array $attributes) => ['role' => 'model']);
    }

    /** Named atSequence() because Factory::sequence() is already taken. */
    public function atSequence(int $sequence): static
    {
        return $this->state(fn (array $attributes) => ['sequence' => $sequence]);
    }
}
