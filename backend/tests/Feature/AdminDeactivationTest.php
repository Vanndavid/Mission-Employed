<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * An admin deactivating and reactivating an account.
 *
 * Deactivation is a lock, not a delete: the account keeps its data, cannot sign
 * in, and every token it already holds stops working at once -- including the
 * one an MCP connector is using. Reactivating lets it sign in again.
 *
 * The token tests use real Sanctum tokens rather than actingAs(), because
 * actingAs() skips token authentication entirely and would pass whether or not
 * a deactivated account's token is refused.
 */
class AdminDeactivationTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_admin_can_deactivate_another_user(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => false])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.deactivatedAt', fn ($value) => is_string($value) && $value !== '');

        $this->assertTrue($user->fresh()->isDeactivated());
    }

    public function test_deactivating_revokes_every_token_the_user_holds(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();
        $laptop = $user->createToken('api')->plainTextToken;
        $user->createToken('api');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => false])
            ->assertOk();

        $this->assertSame(0, $user->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($laptop)->getJson('/api/auth/me')->assertUnauthorized();
    }

    /**
     * Revoking on deactivation is the first line; this is the second. A token
     * that somehow outlived the revoke -- a login racing the admin's click --
     * must still be refused while the account is deactivated.
     */
    public function test_a_surviving_token_is_refused_while_the_account_is_deactivated(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('api')->plainTextToken;

        $user->forceFill(['deactivated_at' => now()])->save();

        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/applications')->assertUnauthorized();
    }

    public function test_a_deactivated_user_cannot_log_in(): void
    {
        $user = User::factory()->deactivated()->create(['password' => 'correct-password']);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'correct-password'])
            ->assertForbidden()
            ->assertJsonPath('code', 'account_deactivated')
            ->assertJsonMissingPath('token');

        $this->assertSame(0, $user->tokens()->count());
    }

    /**
     * Only someone who knows the password learns the account is deactivated.
     * A wrong guess gets the same answer as for any other account.
     */
    public function test_a_wrong_password_on_a_deactivated_account_does_not_reveal_it(): void
    {
        $user = User::factory()->deactivated()->create(['password' => 'correct-password']);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('email')
            ->assertJsonMissingPath('code');
    }

    public function test_an_admin_can_reactivate_a_user_who_can_then_log_in(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->deactivated()->create(['password' => 'correct-password']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => true])
            ->assertOk()
            ->assertJsonPath('user.deactivatedAt', null);

        $this->assertFalse($user->fresh()->isDeactivated());

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'correct-password'])
            ->assertOk()
            ->assertJsonStructure(['token']);
    }

    public function test_deactivating_keeps_the_users_data(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();
        Application::factory()->count(2)->for($user)->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => false])
            ->assertOk();

        $this->assertModelExists($user);
        $this->assertSame(2, $user->applications()->count());
    }

    /** A second click must not move the date the account was locked. */
    public function test_deactivating_twice_keeps_the_original_date(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['deactivated_at' => Carbon::parse('2026-09-01 12:00:00')]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => false])
            ->assertOk();

        $this->assertTrue($user->fresh()->deactivated_at->equalTo(Carbon::parse('2026-09-01 12:00:00')));
    }

    /**
     * Otherwise the last admin could lock everyone out of the admin screen.
     * Because nobody can deactivate themselves, whoever is acting is always
     * an active admin, so deactivating another admin is allowed.
     */
    public function test_an_admin_cannot_deactivate_themselves(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$admin->id}/active", ['active' => false])
            ->assertForbidden()
            ->assertJsonPath('code', 'self_deactivation');

        $this->assertFalse($admin->fresh()->isDeactivated());
    }

    public function test_an_admin_can_deactivate_another_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $other = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$other->id}/active", ['active' => false])
            ->assertOk();

        $this->assertTrue($other->fresh()->isDeactivated());
    }

    public function test_a_non_admin_cannot_deactivate_anyone(): void
    {
        $user = User::factory()->premium()->create();
        $victim = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/admin/users/{$victim->id}/active", ['active' => false])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_required');

        $this->assertFalse($victim->fresh()->isDeactivated());
    }

    public function test_active_must_be_a_boolean(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", [])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('active');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/active", ['active' => 'nope'])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('active');

        $this->assertFalse($user->fresh()->isDeactivated());
    }

    public function test_the_admin_list_shows_who_is_deactivated(): void
    {
        $admin = User::factory()->admin()->create();
        $locked = User::factory()->deactivated()->create();

        $users = collect(
            $this->actingAs($admin, 'sanctum')->getJson('/api/admin/users')->assertOk()->json('users'),
        )->keyBy('id');

        $this->assertNull($users[$admin->id]['deactivatedAt']);
        $this->assertNotNull($users[$locked->id]['deactivatedAt']);
    }

    /** Not mass assignable: only the admin route sets it. */
    public function test_deactivated_at_is_not_fillable(): void
    {
        $user = new User(['deactivated_at' => now()]);

        $this->assertNull($user->deactivated_at);
    }
}
