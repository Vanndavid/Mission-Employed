<?php

use App\Http\Controllers\Auth\AdminUserController;
use App\Http\Controllers\Auth\AuthController;
use Illuminate\Support\Facades\Route;

// Auth and admin routes. Owned by task 2.1 in TASKS.md.
//
// Tokens are Sanctum personal access tokens sent as "Authorization: Bearer".
// Register and login are the only routes here that are reachable unauthenticated.

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

// Plans are upgraded by hand by an admin; there is no payment integration.
Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function (): void {
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::patch('/users/{user}/plan', [AdminUserController::class, 'updatePlan']);
});
