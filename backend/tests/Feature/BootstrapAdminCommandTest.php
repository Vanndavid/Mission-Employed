<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BootstrapAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    private function configureAdmin(string $email = 'admin@example.test', string $password = 'secret-password'): void
    {
        config(['admin.email' => $email, 'admin.password' => $password, 'admin.name' => 'Mission Control']);
    }

    public function test_it_creates_the_admin_when_none_exists(): void
    {
        $this->configureAdmin();

        $this->artisan('admin:bootstrap')->assertSuccessful();

        $admin = User::query()->where('email', 'admin@example.test')->sole();
        $this->assertSame(AccountRole::Admin, $admin->role);
        $this->assertSame(AccountPlan::Premium, $admin->plan);
        $this->assertSame('Mission Control', $admin->name);
        $this->assertTrue(Hash::check('secret-password', $admin->password));
    }

    public function test_it_is_idempotent_and_does_not_accumulate_accounts(): void
    {
        $this->configureAdmin();

        $this->artisan('admin:bootstrap')->assertSuccessful();
        $this->artisan('admin:bootstrap')->assertSuccessful();

        $this->assertSame(1, User::query()->where('email', 'admin@example.test')->count());
    }

    public function test_it_reconciles_the_password_role_and_plan_of_an_existing_account(): void
    {
        // An account that has drifted: demoted, downgraded, old password.
        User::factory()->create([
            'email' => 'admin@example.test',
            'name' => 'Renamed By Hand',
            'password' => 'stale-password',
            'role' => AccountRole::User,
            'plan' => AccountPlan::Free,
        ]);

        $this->configureAdmin();
        $this->artisan('admin:bootstrap')->assertSuccessful();

        $admin = User::query()->where('email', 'admin@example.test')->sole();
        $this->assertSame(AccountRole::Admin, $admin->role);
        $this->assertSame(AccountPlan::Premium, $admin->plan);
        $this->assertTrue(Hash::check('secret-password', $admin->password));
        // A name set in the app survives; only the credentials are reconciled.
        $this->assertSame('Renamed By Hand', $admin->name);
    }

    public function test_it_does_nothing_when_the_environment_is_not_configured(): void
    {
        config(['admin.email' => null, 'admin.password' => null]);

        $this->artisan('admin:bootstrap')->assertSuccessful();

        $this->assertSame(0, User::query()->count());
    }

    public function test_it_does_nothing_when_only_the_email_is_set(): void
    {
        config(['admin.email' => 'admin@example.test', 'admin.password' => '']);

        $this->artisan('admin:bootstrap')->assertSuccessful();

        $this->assertSame(0, User::query()->count());
    }

    public function test_it_leaves_other_accounts_alone(): void
    {
        $other = User::factory()->create(['email' => 'someone@example.test', 'role' => AccountRole::User]);

        $this->configureAdmin();
        $this->artisan('admin:bootstrap')->assertSuccessful();

        $this->assertSame(AccountRole::User, $other->fresh()->role);
        $this->assertSame(2, User::query()->count());
    }
}
