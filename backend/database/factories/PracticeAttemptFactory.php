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

    /**
     * A scored review of a code review snippet that found nothing: one
     * comment, every issue missed. Pair it with a question made with
     * PracticeQuestionFactory::codeReview().
     */
    public function codeReview(): static
    {
        return $this->state(fn (array $attributes) => [
            'kind' => PracticeKind::CodeReview,
            'response' => ['comments' => [['line' => 1, 'body' => 'Looks fine to me.']], 'summary' => null],
            'score' => 0,
            'max_score' => 100,
            'correct' => null,
            'feedback' => [
                'breakdown' => [
                    'detection' => ['points' => 0, 'max' => 70, 'found' => 0, 'total' => 0, 'severityFound' => 0, 'severityTotal' => 0],
                    'fixes' => ['points' => 0, 'max' => 20],
                    'precision' => ['points' => 0, 'max' => 10, 'useful' => 0, 'comments' => 1],
                ],
                'issues' => [],
                'bonus' => [],
                'takeaway' => 'Read it twice.',
            ],
            'rubric_version' => 'cr-1',
        ]);
    }
}
