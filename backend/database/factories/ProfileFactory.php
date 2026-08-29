<?php

namespace Database\Factories;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Profile>
 */
class ProfileFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'base_cv' => fake()->paragraphs(3, true),
            'cv_file_name' => fake()->slug(2).'.pdf',
            'base_cover_letter' => fake()->paragraphs(2, true),
            'portfolio_url' => fake()->url(),
            'cover_letter_template' => fake()->paragraph(),
            'cv_template' => fake()->paragraph(),
        ];
    }

    public function empty(): static
    {
        return $this->state(fn (array $attributes) => [
            'base_cv' => null,
            'cv_file_name' => null,
            'base_cover_letter' => null,
            'portfolio_url' => null,
            'cover_letter_template' => null,
            'cv_template' => null,
        ]);
    }
}
