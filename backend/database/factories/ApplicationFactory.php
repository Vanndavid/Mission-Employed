<?php

namespace Database\Factories;

use App\Enums\JobStatus;
use App\Models\Application;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Application>
 */
class ApplicationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'company' => fake()->company(),
            'role' => fake()->jobTitle(),
            'location' => fake()->city(),
            'url' => fake()->url(),
            'status' => fake()->randomElement(JobStatus::cases()),
            'date_applied' => fake()->dateTimeBetween('-3 months', 'now')->format('Y-m-d'),
            'notes' => fake()->sentence(),
            'job_description' => fake()->paragraphs(2, true),
            'cover_letter' => null,
            'tailored_cv' => null,
            'next_action' => fake()->sentence(4),
            'next_action_due' => fake()->dateTimeBetween('now', '+3 weeks')->format('Y-m-d'),
            'recruiter_name' => fake()->name(),
            'recruiter_email' => fake()->safeEmail(),
            'recruiter_linkedin' => 'https://www.linkedin.com/in/'.fake()->slug(2),
            'offer' => null,
            'take_home' => null,
        ];
    }

    public function status(JobStatus $status): static
    {
        return $this->state(fn (array $attributes) => ['status' => $status]);
    }

    public function withOffer(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => JobStatus::Offer,
            'offer' => [
                'base' => fake()->numberBetween(60000, 180000),
                'equity' => fake()->numberBetween(0, 50).'k RSUs over 4 years',
                'benefits' => 'Private health, 25 days holiday',
                'startDate' => fake()->dateTimeBetween('now', '+2 months')->format('Y-m-d'),
            ],
        ]);
    }

    public function withTakeHome(): static
    {
        return $this->state(fn (array $attributes) => [
            'take_home' => [
                'deadline' => fake()->dateTimeBetween('now', '+2 weeks')->format('Y-m-d'),
                'repo' => 'https://github.com/'.fake()->slug(1).'/'.fake()->slug(2),
                'status' => fake()->randomElement(['not_started', 'in_progress', 'submitted']),
            ],
        ]);
    }
}
