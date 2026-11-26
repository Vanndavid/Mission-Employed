<?php

namespace Database\Factories;

use App\Models\PracticeQuestion;
use App\Models\PracticeQuestionReport;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * An open report on a published question by default.
 *
 * @extends Factory<PracticeQuestionReport>
 */
class PracticeQuestionReportFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'practice_question_id' => PracticeQuestion::factory(),
            'user_id' => User::factory(),
            'reason' => 'The answer looks wrong: '.fake()->sentence(),
            'resolved_at' => null,
        ];
    }

    public function resolved(): static
    {
        return $this->state(fn (array $attributes) => ['resolved_at' => now()->subDay()]);
    }
}
