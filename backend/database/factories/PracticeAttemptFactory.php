<?php

namespace Database\Factories;

use App\Enums\PracticeKind;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A right answer to a quiz question by default.
 *
 * @extends Factory<PracticeAttempt>
 */
class PracticeAttemptFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'practice_question_id' => PracticeQuestion::factory(),
            'kind' => PracticeKind::Quiz,
            'response' => ['choice' => null],
            'score' => 1,
            'max_score' => 1,
            'correct' => true,
            'feedback' => null,
            'rubric_version' => null,
            'created_at' => now(),
        ];
    }

    public function wrong(): static
    {
        return $this->state(fn (array $attributes) => ['correct' => false, 'score' => 0]);
    }
}
