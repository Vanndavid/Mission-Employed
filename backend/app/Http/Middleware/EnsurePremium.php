<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates the AI features behind a premium plan.
 *
 * The rule must stay identical to User::isPremium() and to isPremiumUser() in
 * frontend/types/auth.ts: a premium plan OR an admin role. The client gate is a
 * courtesy so the UI can show an upgrade prompt; this is the enforcement.
 */
class EnsurePremium
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isPremium()) {
            return response()->json([
                'message' => 'This feature requires a premium plan.',
                'code' => 'premium_required',
            ], 403);
        }

        return $next($request);
    }
}
