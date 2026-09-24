<?php

use App\Http\Controllers\HealthController;
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

// Unauthenticated health check — used by the frontend, deploy checks and the
// uptime workflow. 503 when the database or storage is broken.
Route::get('/health', HealthController::class);

// Split by feature so parallel work does not collide in one file.
require __DIR__.'/api/auth.php';
require __DIR__.'/api/tracker.php';
require __DIR__.'/api/ai.php';
