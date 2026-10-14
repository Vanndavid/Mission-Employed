<?php

namespace Tests\Feature;

use App\Enums\AccountRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserPreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_preferences_require_a_token(): void
    {
        $this->patchJson('/api/auth/preferences', ['applicationsPageSize' => 10])->assertUnauthorized();
    }

    public function test_a_new_account_reads_back_the_defaults(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.preferences.applicationsPageSize', 5);
    }

    public function test_the_page_size_is_saved_on_the_account(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/auth/preferences', ['applicationsPageSize' => 25])
            ->assertOk()
            ->assertJsonPath('user.preferences.applicationsPageSize', 25);

        $this->assertSame(['applicationsPageSize' => 25], $user->fresh()->preferences);

        // What a fresh page load (or another device) sees.
        $this->getJson('/api/auth/me')->assertJsonPath('user.preferences.applicationsPageSize', 25);
    }

    public function test_a_numeric_string_is_stored_as_a_number(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/auth/preferences', ['applicationsPageSize' => '25'])
            ->assertOk()
            ->assertJsonPath('user.preferences.applicationsPageSize', 25);

        $this->assertSame(['applicationsPageSize' => 25], $user->fresh()->preferences);
    }

    public function test_it_only_saves_to_the_signed_in_account(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create(['preferences' => ['applicationsPageSize' => 50]]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/auth/preferences', ['applicationsPageSize' => 10])->assertOk();

        $this->assertSame(['applicationsPageSize' => 50], $other->fresh()->preferences);
    }

    public function test_it_rejects_a_page_size_that_is_not_offered(): void
    {
        $user = User::factory()->create(['preferences' => ['applicationsPageSize' => 10]]);
        Sanctum::actingAs($user);

        foreach ([0, 7, 1000, 'ten', null] as $size) {
            $this->patchJson('/api/auth/preferences', ['applicationsPageSize' => $size])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('applicationsPageSize');
        }

        $this->assertSame(['applicationsPageSize' => 10], $user->fresh()->preferences);
    }

    public function test_it_ignores_keys_it_does_not_know(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/auth/preferences', [
            'applicationsPageSize' => 10,
            'theme' => 'dark',
            'role' => 'admin',
        ])->assertOk();

        $user->refresh();
        $this->assertSame(['applicationsPageSize' => 10], $user->preferences);
        $this->assertSame(AccountRole::User, $user->role);
    }

    public function test_an_empty_patch_keeps_what_was_saved(): void
    {
        $user = User::factory()->create(['preferences' => ['applicationsPageSize' => 50]]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/auth/preferences', [])
            ->assertOk()
            ->assertJsonPath('user.preferences.applicationsPageSize', 50);
    }

    public function test_a_stored_size_no_longer_offered_reads_back_as_the_default(): void
    {
        // If the choices ever shrink, an old saved value must not reach the client.
        Sanctum::actingAs(User::factory()->create(['preferences' => ['applicationsPageSize' => 7]]));

        $this->getJson('/api/auth/me')->assertJsonPath('user.preferences.applicationsPageSize', 5);
    }
}
