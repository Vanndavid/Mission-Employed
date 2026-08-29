<?php

namespace Database\Factories;

use App\Models\Application;
use App\Models\InterviewStage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InterviewStage>
 */
class InterviewStageFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'application_id' => Application::factory(),
            'type' => fake()->randomElement(InterviewStage::TYPES),
            'scheduled_at' => fake()->dateTimeBetween('-2 weeks', '+3 weeks'),
            'notes' => fake()->sentence(),
        ];
    }
}
