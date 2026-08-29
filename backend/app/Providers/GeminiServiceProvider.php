<?php

namespace App\Providers;

use App\Services\GeminiClient;
use App\Services\GeminiService;
use Illuminate\Contracts\Support\DeferrableProvider;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the Gemini transport behind the GeminiClient interface.
 *
 * Controllers and jobs must type-hint GeminiClient (never GeminiService) so a
 * test can swap in FakeGeminiService and keep the suite off the network:
 *
 *     $this->app->instance(GeminiClient::class, new FakeGeminiService);
 *     // or simply: FakeGeminiService::swap();
 */
class GeminiServiceProvider extends ServiceProvider implements DeferrableProvider
{
    public function register(): void
    {
        $this->app->singleton(GeminiService::class, fn () => new GeminiService);

        $this->app->singleton(GeminiClient::class, fn ($app) => $app->make(GeminiService::class));
    }

    /**
     * @return array<int, string>
     */
    public function provides(): array
    {
        return [GeminiClient::class, GeminiService::class];
    }
}
