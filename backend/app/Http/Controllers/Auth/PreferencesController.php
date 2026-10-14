<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdatePreferencesRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;

/**
 * The signed-in user's UI preferences. They are read back as part of the user
 * (GET /auth/me), so this only needs the write.
 */
class PreferencesController extends Controller
{
    public function __invoke(UpdatePreferencesRequest $request): JsonResponse
    {
        $user = $request->user();

        // Merged, so saving one preference never resets another.
        $user->preferences = [...($user->preferences ?? []), ...$request->preferences()];
        $user->save();

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }
}
