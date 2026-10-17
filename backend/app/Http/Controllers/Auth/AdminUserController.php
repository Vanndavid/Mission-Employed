<?php

namespace App\Http\Controllers\Auth;

use App\Enums\AccountPlan;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdateUserActiveRequest;
use App\Http\Requests\Auth\UpdateUserPlanRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * The admin user list, the manual plan switch, Premium requests, and
 * deactivation.
 *
 * Both routes sit behind auth:sanctum + the `admin` middleware, so nothing here
 * re-checks the role — the boundary lives in exactly one place.
 */
class AdminUserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'users' => UserResource::collection(User::orderBy('id')->get()),
        ]);
    }

    public function updatePlan(UpdateUserPlanRequest $request, User $user): JsonResponse
    {
        // An admin editing their own row is either a mistake or an attempt to
        // self-serve an upgrade; either way another admin has to do it.
        if ($request->user()->is($user)) {
            return response()->json([
                'message' => 'You cannot change your own plan.',
                'code' => 'self_plan_change',
            ], 403);
        }

        // Setting the plan either way answers a pending Premium request.
        $user->forceFill([
            'plan' => $request->plan(),
            'plan_expires_at' => $request->plan() === AccountPlan::Premium ? $request->expiresAt() : null,
            'premium_requested_at' => null,
        ])->save();

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }

    /** Turn a request down without changing the plan. */
    public function dismissPremiumRequest(User $user): JsonResponse
    {
        $user->forceFill(['premium_requested_at' => null])->save();

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }

    /**
     * Deactivating locks the account and revokes its tokens; nothing is
     * deleted, so reactivating gives it back as it was.
     */
    public function updateActive(UpdateUserActiveRequest $request, User $user): JsonResponse
    {
        // Refusing self-deactivation means whoever is acting is always an
        // active admin, so the admin screen can never lock its last user out.
        if (! $request->active() && $request->user()->is($user)) {
            return response()->json([
                'message' => 'You cannot deactivate your own account.',
                'code' => 'self_deactivation',
            ], 403);
        }

        $request->active() ? $user->reactivate() : $user->deactivate();

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }
}
