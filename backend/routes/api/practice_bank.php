<?php

use App\Http\Controllers\Practice\AdminQuestionBankController;
use App\Http\Controllers\Practice\AdminQuestionDraftController;
use App\Http\Controllers\Practice\QuestionReportController;
use Illuminate\Support\Facades\Route;

// The practice question bank's review flow. Task 7.2 in TASKS.md.
//
// The AI drafts questions, code checks them, and an admin reviews, edits and
// publishes them; users are only ever served published ones. These are admin
// routes, so none names a `feature:`; the drafts' tokens are recorded like any
// other Gemini call's.

Route::prefix('admin/practice/questions')->middleware(['auth:sanctum', 'admin'])->group(function (): void {
    // ?kind=&status=&language=&topic=&source=&reported=1&page=: 25 a page, open reports first.
    Route::get('/', [AdminQuestionBankController::class, 'index']);
    // {kind, count <= 5, ...the kind's fields}: {drafts, rejected: [{index, prompt, reasons}]}.
    Route::post('/generate', AdminQuestionDraftController::class);
    // Any content field and/or {status}; the kind's checks run on every save. Seed rows: 422.
    Route::patch('/{question}', [AdminQuestionBankController::class, 'update'])->whereNumber('question');
    // Deleted if nobody has answered it, else unpublished: {deleted, question | null}. Seed rows: 422.
    Route::delete('/{question}', [AdminQuestionBankController::class, 'destroy'])->whereNumber('question');
    Route::post('/{question}/reports/resolve', [AdminQuestionBankController::class, 'resolveReports'])->whereNumber('question');
});

// {reason}: one open report per user per question. 404 for a draft.
Route::post('/practice/questions/{question}/report', QuestionReportController::class)
    ->middleware('auth:sanctum')
    ->whereNumber('question');
