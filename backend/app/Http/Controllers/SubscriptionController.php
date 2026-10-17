<?php

namespace App\Http\Controllers;

use App\Services\Plans\Entitlements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in account's side of the plans: what its plan includes, how much
 * of each allowance is left, every plan to compare it with, and the "Request
 * Premium" button.
 *
 * There is no payment integration. A request is a flag an admin sees on the
 * users screen and answers by setting the plan (AdminUserController), which
 * clears it.
 */
class SubscriptionController extends Controller
{
    public function show(Request $request, Entitlements $entitlements): JsonResponse
    {
        return response()->json($entitlements->summary($request->user()));
    }

    /** Asking again keeps the original date, so it keeps its place in the queue. */
    public function requestPremium(Request $request, Entitlements $entitlements): JsonResponse
    {
        $user = $request->user();

        if ($user->isPremium()) {
            return response()->json([
                'message' => 'This account is already on Premium.',
                'code' => 'already_premium',
            ], 409);
        }

        $user->premium_requested_at ??= now();
        $user->save();

        return response()->json($entitlements->summary($user));
    }

    public function withdraw(Request $request, Entitlements $entitlements): JsonResponse
    {
        $user = $request->user();
        $user->premium_requested_at = null;
        $user->save();

        return response()->json($entitlements->summary($user));
    }
}
