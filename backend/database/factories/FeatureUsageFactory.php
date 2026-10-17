<?php

namespace Database\Factories;

use App\Enums\Feature;
use App\Models\FeatureUsage;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FeatureUsage>
 */
class FeatureUsageFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'feature' => Feature::CodingProblem,
        ];
    }
}
