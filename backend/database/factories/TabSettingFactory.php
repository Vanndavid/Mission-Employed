<?php

namespace Database\Factories;

use App\Enums\NavTab;
use App\Models\TabSetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TabSetting>
 */
class TabSettingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'key' => NavTab::TrainingRoom,
            'hidden' => true,
        ];
    }
}
