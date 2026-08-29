<?php

use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\BehavioralAnswerController;
use App\Http\Controllers\CodingAttemptController;
use App\Http\Controllers\InterviewStageController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

// Job application tracker, CV profile, coding history and behavioral answers.
// Owned by task 2.2 in TASKS.md.
//
// Everything here needs a token and nothing here is premium-gated — the plan
// only decides what AI features a user can reach.
//
// Records are addressed by id but never trusted by id: controllers answer 404
// for another user's row rather than 403, so the API does not confirm that
// someone else's application exists.

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/applications', [ApplicationController::class, 'index']);
    Route::post('/applications', [ApplicationController::class, 'store']);
    Route::get('/applications/{application}', [ApplicationController::class, 'show']);
    Route::patch('/applications/{application}', [ApplicationController::class, 'update']);
    Route::delete('/applications/{application}', [ApplicationController::class, 'destroy']);

    // The parameter is {interviewStage} rather than {stage} so scopeBindings()
    // resolves it through Application::interviewStages() — a stage id from
    // another application then 404s before the controller is reached.
    Route::post('/applications/{application}/stages', [InterviewStageController::class, 'store']);
    Route::delete('/applications/{application}/stages/{interviewStage}', [InterviewStageController::class, 'destroy'])
        ->scopeBindings();

    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);

    Route::get('/coding/attempts', [CodingAttemptController::class, 'index']);
    Route::post('/coding/attempts', [CodingAttemptController::class, 'store']);

    // {themeId} is a client-side theme string (BehavioralAnswer::THEME_IDS),
    // not a row id: answers are unique per user and theme.
    Route::get('/behavioral-answers', [BehavioralAnswerController::class, 'index']);
    Route::put('/behavioral-answers/{themeId}', [BehavioralAnswerController::class, 'update']);
});
