<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdateUserPlanRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * The admin user list and the manual plan switch.
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

        $user->update(['plan' => $request->plan()]);

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }
}
