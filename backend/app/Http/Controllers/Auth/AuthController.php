<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Registration, login, logout and the current user.
 *
 * Replaces the HMAC scheme in the retired server/auth.js — tokens are now
 * Sanctum personal access tokens, so revocation is a row delete rather than
 * something the server cannot do at all.
 */
class AuthController extends Controller
{
    /** The name every token issued by this controller carries. */
    private const TOKEN_NAME = 'api';

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request): User {
            $user = User::create([
                'email' => $request->string('email')->value(),
                // The 'password' => 'hashed' cast on the model does the hashing.
                'password' => $request->string('password')->value(),
            ]);

            // Every user has a profile from the moment they exist, so the
            // tracker and CV endpoints can assume one rather than upserting.
            $user->profile()->create([]);

            return $user;
        });

        return response()->json([
            'user' => new UserResource($user),
            'token' => $user->createToken(self::TOKEN_NAME)->plainTextToken,
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $password = $request->string('password')->value();
        $user = User::where('email', $request->string('email')->value())->first();

        if (! $user) {
            // Burn a comparable amount of time on an unknown address so the
            // response latency does not answer "is this email registered?".
            Hash::make($password);
        }

        if (! $user || ! Hash::check($password, $user->password)) {
            // One message and one status for both failure modes: a wrong
            // password and an address that was never registered are
            // indistinguishable from the outside.
            throw ValidationException::withMessages([
                'email' => [trans('auth.failed')],
            ]);
        }

        return response()->json([
            'user' => new UserResource($user),
            'token' => $user->createToken(self::TOKEN_NAME)->plainTextToken,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => new UserResource($request->user()),
        ]);
    }

    /**
     * Revoke only the token that made this request. Signing out of a laptop
     * must not sign the same account out on a phone.
     */
    public function logout(Request $request): Response
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
