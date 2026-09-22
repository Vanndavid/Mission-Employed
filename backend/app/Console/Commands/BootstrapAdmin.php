<?php

namespace App\Console\Commands;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Create or reconcile the deployment's admin account from the environment.
 *
 * This is deliberately not a seeder. DatabaseSeeder also inserts demo
 * applications and a fake second user, which must never reach production, and
 * the container entrypoint needs something it can run unconditionally on every
 * boot.
 *
 * Reconciling -- rather than only creating -- matches the Express server this
 * replaced. The environment is the source of truth for the admin credentials,
 * so an admin locked out of the deployment is recovered by editing .env and
 * restarting rather than by hand-editing the database. The cost of that choice
 * is that a password changed in the app is reverted on the next boot, which is
 * acceptable while ADMIN_PASSWORD is the documented way in.
 */
class BootstrapAdmin extends Command
{
    protected $signature = 'admin:bootstrap';

    protected $description = 'Create or reconcile the admin account from ADMIN_EMAIL and ADMIN_PASSWORD';

    public function handle(): int
    {
        $email = config('admin.email');
        $password = config('admin.password');

        // Both or nothing. A half-configured environment should not silently
        // create an account with a blank password.
        if (blank($email) || blank($password)) {
            $this->components->info('ADMIN_EMAIL and ADMIN_PASSWORD are not both set; leaving the admin account alone.');

            return self::SUCCESS;
        }

        $existing = User::query()->where('email', $email)->first();

        $user = $existing ?? new User;
        $user->email = $email;
        // A deployment may have renamed the account in the app; only fill the
        // name when there is not one already.
        $user->name = $existing?->name ?: config('admin.name');
        // The `password` cast hashes on assignment.
        $user->password = $password;
        $user->role = AccountRole::Admin;
        $user->plan = AccountPlan::Premium;
        $user->save();

        $this->components->info(sprintf(
            '%s admin account %s.',
            $existing ? 'Reconciled' : 'Created',
            $email,
        ));

        return self::SUCCESS;
    }
}
