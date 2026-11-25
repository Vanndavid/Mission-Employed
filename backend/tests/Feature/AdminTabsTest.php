<?php

namespace Tests\Feature;

use App\Enums\NavTab;
use App\Models\TabSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Which sidebar tabs users see. One list for the whole site, set by an admin;
 * the client reads it from the session payloads (me, login, register).
 *
 * Hiding a tab is decluttering, not a gate: the features behind it stay under
 * the plan's feature middleware, which these tests do not touch.
 */
class AdminTabsTest extends TestCase
{
    use RefreshDatabase;

    public function test_with_nothing_saved_only_the_training_room_is_hidden(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('hiddenTabs', ['training_room']);
    }

    public function test_login_and_register_carry_the_hidden_tabs_too(): void
    {
        TabSetting::factory()->create(['key' => NavTab::MockTest, 'hidden' => true]);
        User::factory()->create(['email' => 'a@example.com', 'password' => 'password123']);

        $this->postJson('/api/auth/login', ['email' => 'a@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJsonPath('hiddenTabs', ['training_room', 'mock_test']);

        $this->postJson('/api/auth/register', [
            'email' => 'b@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertCreated()
            ->assertJsonPath('hiddenTabs', ['training_room', 'mock_test']);
    }

    public function test_only_an_admin_can_change_them(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->putJson('/api/admin/tabs', ['hiddenTabs' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_required');

        $this->assertSame(0, TabSetting::count());
    }

    public function test_an_admin_replaces_the_list_and_every_user_sees_it(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        // Sent out of order; read back in sidebar order.
        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['mock_test', 'mission_control']])
            ->assertOk()
            ->assertExactJson(['hiddenTabs' => ['mission_control', 'mock_test']]);

        Sanctum::actingAs(User::factory()->create());

        // The training room was hidden only by default; the list replaced it.
        $this->getJson('/api/auth/me')->assertJsonPath('hiddenTabs', ['mission_control', 'mock_test']);
    }

    public function test_the_quiz_is_a_mode_an_admin_can_hide_like_a_tab(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['practice_quiz']])
            ->assertOk()
            ->assertExactJson(['hiddenTabs' => ['practice_quiz']]);
    }

    public function test_an_empty_list_shows_every_tab(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->putJson('/api/admin/tabs', ['hiddenTabs' => []])
            ->assertOk()
            ->assertExactJson(['hiddenTabs' => []]);

        $this->getJson('/api/auth/me')->assertJsonPath('hiddenTabs', []);
    }

    public function test_saving_twice_keeps_one_row_per_tab(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['profile']])->assertOk();
        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['applications']])->assertOk();

        $this->assertSame(count(NavTab::cases()), TabSetting::count());
        $this->getJson('/api/auth/me')->assertJsonPath('hiddenTabs', ['applications']);
    }

    public function test_it_rejects_a_tab_it_does_not_know_or_a_missing_list(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        // Plan & usage, Settings and the admin pages cannot be hidden.
        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['settings']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hiddenTabs.0');

        $this->putJson('/api/admin/tabs', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hiddenTabs');

        $this->putJson('/api/admin/tabs', ['hiddenTabs' => ['profile', 'profile']])
            ->assertUnprocessable();

        $this->assertSame(0, TabSetting::count());
    }
}
