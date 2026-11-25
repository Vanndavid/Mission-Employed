<?php

use App\Http\Controllers\Practice\QuizController;
use Illuminate\Support\Facades\Route;

// Practice modes on Mission Control that share the question bank
// (practice_questions) and attempts (practice_attempts). Task 7.1 in TASKS.md.
//
// The quiz never calls a model, so none of its routes names a `feature:`:
// it is on every plan and never metered. Code review and system design will
// be plan features when they land, and say so here.

Route::prefix('practice/quiz')->middleware('auth:sanctum')->group(function (): void {
    // Languages, their topics and published question counts.
    Route::get('/catalog', [QuizController::class, 'catalog']);
    // {language, topic | 'mixed' | 'mistakes'}: ten questions, no keys.
    Route::post('/rounds', [QuizController::class, 'round']);
    // {questionId, choice | null}: {correct, answer, explanation}, and an attempt stored.
    Route::post('/answers', [QuizController::class, 'answer']);
    // ?language=: accuracy per topic and open mistakes.
    Route::get('/progress', [QuizController::class, 'progress']);
});
