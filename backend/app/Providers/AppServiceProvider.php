<?php

namespace App\Providers;

use App\Services\Ai\DatabaseUsageRecorder;
use App\Services\Ai\UsageRecorder;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Here rather than in the deferred GeminiServiceProvider: a deferred
        // binding is only found through bootstrap/cache/services.php, and a
        // manifest cached before the binding existed made it unresolvable.
        $this->app->singleton(UsageRecorder::class, DatabaseUsageRecorder::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Deactivating an account deletes its tokens, but refusing them here
        // as well means a token that outlived the delete -- a login racing
        // the admin's click -- still answers 401 rather than serving data.
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid): bool => $isValid && ! $token->tokenable?->isDeactivated(),
        );
    }
}
