<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Registered in bootstrap/app.php with the "/api" prefix and the "api"
| middleware group. Authentication is Sanctum bearer tokens: clients send
| "Authorization: Bearer <token>" (see frontend/services/authClient.ts).
|
*/

// Unauthenticated smoke test — used by the frontend and by deploy checks.
Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Placeholder proving the sanctum guard resolves; replaced by
// GET /api/auth/me when the auth controllers land.
Route::get('/user', fn (Request $request) => $request->user())
    ->middleware('auth:sanctum');
