<?php

namespace Database\Factories;

use App\Enums\JobStatus;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ApplicationStatusEvent>
 */
class ApplicationStatusEventFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'application_id' => Application::factory(),
            'status' => fake()->randomElement(JobStatus::cases()),
            'occurred_at' => fake()->dateTimeBetween('-3 months', 'now'),
        ];
    }
}
