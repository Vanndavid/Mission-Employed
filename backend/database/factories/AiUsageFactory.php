<?php

namespace Database\Factories;

use App\Models\AiUsage;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiUsage>
 */
class AiUsageFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $prompt = fake()->numberBetween(100, 5000);
        $output = fake()->numberBetween(50, 1000);

        return [
            'user_id' => User::factory(),
            'feature' => 'ai/coding/problem',
            'model' => 'gemini-3.7-flash',
            'source' => 'server',
            'prompt_tokens' => $prompt,
            'output_tokens' => $output,
            'thought_tokens' => 0,
            'total_tokens' => $prompt + $output,
            'cost_micros' => $prompt * 0.75 + $output * 3.75,
        ];
    }
}
