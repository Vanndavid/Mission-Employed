<?php

namespace Database\Factories;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Models\PlanFeature;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PlanFeature>
 */
class PlanFeatureFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'plan' => AccountPlan::Premium->value,
            'feature' => Feature::CodingProblem,
            'enabled' => true,
            'quota' => null,
            'period' => QuotaPeriod::Day,
        ];
    }
}
