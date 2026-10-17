<?php

use App\Http\Controllers\Auth\AdminPlanController;
use App\Http\Controllers\Auth\AdminUsageController;
use App\Http\Controllers\Auth\AdminUserController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\PreferencesController;
use App\Http\Controllers\SubscriptionController;
use Illuminate\Support\Facades\Route;

// Auth and admin routes. Owned by task 2.1 in TASKS.md.
//
// Tokens are Sanctum personal access tokens sent as "Authorization: Bearer".
// Register and login are the only routes here that are reachable unauthenticated.

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        // Partial: {applicationsPageSize: 25} leaves any other preference alone.
        Route::patch('/preferences', PreferencesController::class);
    });
});

// The account's plan, allowances and usage, and asking for Premium. There is
// no payment integration: an admin answers a request on the users screen.
Route::prefix('subscription')->middleware('auth:sanctum')->group(function (): void {
    Route::get('/', [SubscriptionController::class, 'show']);
    Route::post('/request', [SubscriptionController::class, 'requestPremium']);
    Route::delete('/request', [SubscriptionController::class, 'withdraw']);
});

// Plans are upgraded by hand by an admin; there is no payment integration.
Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function (): void {
    Route::get('/users', [AdminUserController::class, 'index']);
    // {plan: 'premium', expiresAt: ISO date | null}; expiresAt is ignored for free.
    Route::patch('/users/{user}/plan', [AdminUserController::class, 'updatePlan']);
    Route::delete('/users/{user}/premium-request', [AdminUserController::class, 'dismissPremiumRequest']);
    // {active: false} deactivates and signs the account out; {active: true} restores it.
    Route::patch('/users/{user}/active', [AdminUserController::class, 'updateActive']);

    // Gemini token usage and estimated cost per user, over ?days= (default 30).
    Route::get('/usage', [AdminUsageController::class, 'index']);

    // What each plan includes and how often: AccountPlan x Feature.
    Route::get('/plans', [AdminPlanController::class, 'index']);
    Route::patch('/plans/{plan}', [AdminPlanController::class, 'update']);
});
