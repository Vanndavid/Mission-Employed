<?php

namespace App\Providers;

use App\Models\Plan;
use App\Services\Ai\DatabaseUsageRecorder;
use App\Services\Ai\UsageRecorder;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
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

        // The two routes reachable without a token. Login is keyed on the
        // account as well as the address, so guessing at one account cannot
        // lock anyone else out. Both rely on the trusted proxies in
        // bootstrap/app.php for $request->ip() to be the visitor.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by(Str::lower((string) $request->input('email')).'|'.$request->ip()));

        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));

        // Every metered feature combined, per account, at the rate its plan
        // allows: the daily quotas stop a slow drain, this stops a burst.
        // Admins and a plan with no rate set are not throttled.
        RateLimiter::for('features', function (Request $request): Limit {
            $user = $request->user();
            $perMinute = $user === null || $user->isAdmin()
                ? null
                : Plan::resolve($user->effectivePlan())->requests_per_minute;

            return $perMinute === null
                ? Limit::none()
                : Limit::perMinute($perMinute)
                    ->by('features|'.$user->id)
                    ->response(fn (Request $request, array $headers) => response()->json([
                        'message' => "Too many requests: your plan allows {$perMinute} a minute. Try again in a moment.",
                        'code' => 'rate_limited',
                    ], 429, $headers));
        });
    }
}
