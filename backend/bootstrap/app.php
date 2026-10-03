<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsurePremium;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'premium' => EnsurePremium::class,
            'admin' => EnsureAdmin::class,
        ]);

        // There is no login *page* here -- this is an API and a separate SPA --
        // so a guest is never redirected anywhere. Laravel's default is
        // `redirectGuestsTo(fn () => route('login'))`, and that runs inside the
        // `auth` middleware, before the exception handler gets a say. With no
        // route of that name the lookup threw, so an unauthenticated request
        // that had not sent `Accept: application/json` came back as a 500
        // instead of a 401. Returning null lets it reach the handler, which
        // renders the 401 as JSON (see withExceptions below).
        $middleware->redirectGuestsTo(fn () => null);

        // In production every request arrives from nginx, which got it from
        // Traefik, both on private Docker networks. Trusting those hops makes
        // $request->ip() the visitor rather than nginx, which the login and
        // registration rate limits depend on. Only the private ranges: a
        // visitor's own X-Forwarded-For entries are never believed, because
        // the address is read from the right, past the trusted hops.
        $middleware->trustProxies(at: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Everything under /api is JSON, including its failures. Without this,
        // Laravel only renders a JSON error when the caller sent
        // `Accept: application/json`; anything else -- a browser address bar, a
        // crawler, curl with no headers -- takes the HTML branch, where the
        // `auth` middleware tries to redirect a guest to a route named `login`.
        // There is no such route in an API-only app, so an unauthenticated
        // request came back as a 500 instead of a 401.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
