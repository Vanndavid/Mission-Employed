<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The admin surface and the free/premium boundary.
 *
 * There is no payment integration by design: an admin upgrades a user by hand.
 * That makes these two routes and the `premium` middleware the whole of the
 * plan model, so they carry more weight than their size suggests.
 */
class AdminAndPlanTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The premium gate is exercised through a throwaway route so these tests do
     * not depend on which AI endpoints happen to exist yet.
     */
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'auth:sanctum', 'premium'])
            ->get('/_test/premium', fn () => response()->json(['ok' => true]));
    }

    public function test_an_admin_can_list_users(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(2)->create();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/users')
            ->assertOk()
            ->assertJsonCount(3, 'users')
            ->assertJsonStructure(['users' => [['id', 'email', 'role', 'plan', 'createdAt']]]);
    }

    public function test_a_non_admin_cannot_list_users(): void
    {
        $this->actingAs(User::factory()->premium()->create(), 'sanctum')
            ->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_required');
    }

    public function test_listing_users_requires_authentication(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }

    public function test_an_admin_can_upgrade_another_user(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/plan", ['plan' => 'premium'])
            ->assertOk()
            ->assertJsonPath('user.plan', 'premium');

        $this->assertTrue($user->fresh()->isPremium());
    }

    public function test_an_admin_can_downgrade_another_user(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->premium()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/plan", ['plan' => 'free'])
            ->assertOk();

        $this->assertFalse($user->fresh()->isPremium());
    }

    public function test_an_admin_cannot_change_their_own_plan(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$admin->id}/plan", ['plan' => 'free'])
            ->assertForbidden()
            ->assertJsonPath('code', 'self_plan_change');
    }

    public function test_a_non_admin_cannot_change_a_plan(): void
    {
        $user = User::factory()->create();
        $victim = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/admin/users/{$victim->id}/plan", ['plan' => 'premium'])
            ->assertForbidden();

        $this->assertFalse($victim->fresh()->isPremium());
    }

    public function test_a_plan_outside_the_enum_is_rejected(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/users/{$user->id}/plan", ['plan' => 'enterprise'])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('plan');
    }

    public function test_the_premium_gate_refuses_a_free_user(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum')
            ->getJson('/_test/premium')
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');
    }

    public function test_the_premium_gate_admits_a_premium_user(): void
    {
        $this->actingAs(User::factory()->premium()->create(), 'sanctum')
            ->getJson('/_test/premium')
            ->assertOk();
    }

    /**
     * The rule is "premium plan OR admin role", so an admin still on the free
     * plan gets through. This is the half of User::isPremium() that is easy to
     * drop when the check gets reimplemented somewhere else.
     */
    public function test_the_premium_gate_admits_an_admin_on_the_free_plan(): void
    {
        $admin = User::factory()->admin()->create(['plan' => 'free']);

        $this->assertTrue($admin->isPremium());

        $this->actingAs($admin, 'sanctum')
            ->getJson('/_test/premium')
            ->assertOk();
    }

    public function test_the_premium_gate_refuses_an_unauthenticated_request(): void
    {
        $this->getJson('/_test/premium')->assertUnauthorized();
    }

    /**
     * An admin reads back as premium even while stored as free, matching
     * publicUser() in the retired server/usersStore.js, so the client's
     * isPremiumUser() and the server's gate cannot disagree.
     */
    public function test_an_admin_serializes_as_premium(): void
    {
        $admin = User::factory()->admin()->create(['plan' => 'free']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.plan', 'premium')
            ->assertJsonPath('user.role', 'admin');
    }
}
