<?php

use App\Http\Controllers\Practice\CodeReviewController;
use App\Http\Controllers\Practice\QuizController;
use App\Http\Controllers\Practice\SystemDesignController;
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

// Code review (task 7.3): review a snippet like a pull request. The model
// matches the comments to the snippet's planted issues and
// App\Services\Practice\CodeReviewScorer computes the score, so these name
// the code_review plan feature like the /ai routes do. Opening a snippet or
// reading a review back is free; each scored review is one use.
Route::prefix('practice/code-review')->middleware(['auth:sanctum', 'throttle:features'])->group(function (): void {
    // ?language=&difficulty=&exclude=: a snippet to review, without its issues.
    Route::get('/next', [CodeReviewController::class, 'next'])->middleware('feature:code_review,access');
    // {comments: [{line, body}], summary?}: the score, every planted issue revealed, and an attempt stored.
    Route::post('/{question}/reviews', [CodeReviewController::class, 'review'])
        ->whereNumber('question')
        ->middleware('feature:code_review');
    // A stored review, read back as it was scored.
    Route::get('/reviews/{attempt}', [CodeReviewController::class, 'show'])
        ->whereNumber('attempt')
        ->middleware('feature:code_review,access');
});

// System design (task 7.4): a scenario answered in fixed sections, scored
// against App\Services\Practice\SystemDesignRubric. It calls a model, so
// unlike the quiz it is a plan feature: reading a scenario needs
// `system_design` and each scored answer is one use, under the same
// per-minute cap as the /ai routes.
Route::prefix('practice/system-design')->middleware(['auth:sanctum', 'throttle:features'])->group(function (): void {
    // ?difficulty=&skip=: {question: {id, title, difficulty, prompt} | null, rubric}. No key points.
    Route::get('/next', [SystemDesignController::class, 'next'])->middleware('feature:system_design,access');
    // {sections: {...}}: the score, each trait's rating and the key points covered and missed.
    Route::post('/{question}/answers', [SystemDesignController::class, 'answer'])
        ->whereNumber('question')
        ->middleware('feature:system_design');
});
