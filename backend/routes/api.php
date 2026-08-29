<?php

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

// Split by feature so parallel work does not collide in one file.
require __DIR__.'/api/auth.php';
require __DIR__.'/api/tracker.php';
require __DIR__.'/api/ai.php';
