<?php

namespace Database\Factories;

use App\Enums\AccountPlan;
use App\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Plan>
 */
class PlanFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'key' => AccountPlan::Premium->value,
            'name' => AccountPlan::Premium->label(),
            'price_label' => null,
            'description' => AccountPlan::Premium->defaultDescription(),
            'requests_per_minute' => AccountPlan::Premium->defaultRequestsPerMinute(),
        ];
    }
}
