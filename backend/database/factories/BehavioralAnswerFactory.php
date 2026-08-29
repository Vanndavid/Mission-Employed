<?php

namespace Database\Factories;

use App\Models\BehavioralAnswer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BehavioralAnswer>
 */
class BehavioralAnswerFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'theme_id' => fake()->randomElement(BehavioralAnswer::THEME_IDS),
            'bullets' => [fake()->sentence(), fake()->sentence()],
        ];
    }

    public function theme(string $themeId): static
    {
        return $this->state(fn (array $attributes) => ['theme_id' => $themeId]);
    }
}
