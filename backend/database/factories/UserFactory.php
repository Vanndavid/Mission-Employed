<?php

namespace Database\Factories;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => AccountRole::User,
            'plan' => AccountPlan::Free,
        ];
    }

    public function premium(): static
    {
        return $this->state(fn (array $attributes) => [
            'plan' => AccountPlan::Premium,
        ]);
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => AccountRole::Admin,
            'plan' => AccountPlan::Premium,
        ]);
    }
}
