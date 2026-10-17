<?php

use App\Http\Controllers\Ai\AtsController;
use App\Http\Controllers\Ai\BehavioralController;
use App\Http\Controllers\Ai\CodingController;
use App\Http\Controllers\Ai\DocumentController;
use App\Http\Controllers\Ai\ImportController;
use App\Http\Controllers\Ai\JobController;
use App\Http\Controllers\Ai\MockInterviewController;
use App\Http\Controllers\Ai\SessionController;
use App\Http\Controllers\Ai\SessionMessageController;
use App\Http\Controllers\Ai\TtsController;
use Illuminate\Support\Facades\Route;

// AI routes. Owned by task 2.3 in TASKS.md.
//
// Every model call costs money, so each route names the plan feature it
// belongs to (App\Enums\Feature) through the `feature` middleware, which
// refuses an account whose plan does not include it and counts one use against
// the plan's quota. `,access` checks the plan but counts nothing: opening,
// reading or deleting a session makes no model call. `feature:session` takes
// the feature from the session's kind, so a CV refine chat counts against
// Tailored CV rather than the tutor. throttle:features caps requests per
// minute at the plan's rate. The client's PremiumGate is a courtesy; this is
// the enforcement. An admin sets each plan's features and limits.
//
// Ported from the /ai/* routes in server/index.js. Three shapes changed:
//   - chat sessions are rows in ai_sessions, not keys in an in-memory Map, so
//     they survive a restart and a second worker;
//   - the three near-identical */chat routes collapsed into one
//     /ai/sessions/{session}/messages;
//   - system design, criteria scoring, follow-up emails and negotiation
//     scripts are gone with the features that used them.

Route::prefix('ai')->middleware(['auth:sanctum', 'throttle:features'])->group(function (): void {
    // Coding practice.
    Route::post('/coding/problem', [CodingController::class, 'problem'])->middleware('feature:coding_problem');
    Route::post('/coding/sessions', [CodingController::class, 'store'])->middleware('feature:coding_tutor,access');

    // One turn of any stored chat session: the coding tutor, and the cover
    // letter and CV refine chats. Mock interviews use their own turn route
    // below — they need JSON and inline audio.
    // Read a session back so a refresh can resume it rather than start over.
    Route::get('/sessions/{session}', [SessionController::class, 'show'])->middleware('feature:session,access');
    Route::post('/sessions/{session}/messages', [SessionMessageController::class, 'store'])->middleware('feature:session');

    // One-question interview practice.
    Route::post('/behavioral/prompt', [BehavioralController::class, 'prompt'])->middleware('feature:interview_practice');
    Route::post('/behavioral/evaluate', [BehavioralController::class, 'evaluate'])->middleware('feature:interview_practice');

    // Full mock interview. The index and destroy routes are the history: past
    // interviews to review, each read back through /sessions/{session} above.
    Route::get('/mock/sessions', [MockInterviewController::class, 'index'])->middleware('feature:mock_interview,access');
    Route::post('/mock/sessions', [MockInterviewController::class, 'store'])->middleware('feature:mock_interview,access');
    Route::delete('/mock/sessions/{session}', [MockInterviewController::class, 'destroy'])->middleware('feature:mock_interview,access');
    Route::post('/mock/sessions/{session}/turns', [MockInterviewController::class, 'turn'])->middleware('feature:mock_interview');
    Route::post('/mock/sessions/{session}/report', [MockInterviewController::class, 'report'])->middleware('feature:mock_interview');
    // The spoken interview runs over Gemini Live from the browser: mint its
    // token, then store each exchange it transcribes. The /turns route above
    // stays for typed turns, which the MCP server uses. Each token is one
    // voice connection, so it is the use; storing an exchange makes no call.
    Route::post('/mock/sessions/{session}/live', [MockInterviewController::class, 'live'])->middleware('feature:mock_interview');
    Route::post('/mock/sessions/{session}/exchanges', [MockInterviewController::class, 'exchange'])->middleware('feature:mock_interview,access');

    // Tracker: paste a job description, get fields back.
    Route::post('/job/parse', [JobController::class, 'parse'])->middleware('feature:job_parse');

    // Tracker: hand over a spreadsheet's shape, get a column mapping back.
    // The rows themselves never come here — the client applies the plan and
    // imports through the ordinary /applications endpoints.
    Route::post('/import/plan', [ImportController::class, 'plan'])->middleware('feature:spreadsheet_import');

    // Tailored application documents.
    Route::post('/cover-letter/generate', [DocumentController::class, 'coverLetter'])->middleware('feature:cover_letter');
    Route::post('/cv/generate', [DocumentController::class, 'cv'])->middleware('feature:tailored_cv');
    // Refine chats over a letter or CV; their turns use /sessions/{session}/messages.
    Route::post('/cover-letter/sessions', [DocumentController::class, 'coverLetterSession'])->middleware('feature:cover_letter,access');
    Route::post('/cv/sessions', [DocumentController::class, 'cvSession'])->middleware('feature:tailored_cv,access');

    // Tracker: score a tracked application's CV against its job description.
    // The model only lists the job's keywords, once per job; the score itself
    // is computed by App\Services\Ats\AtsScorer, so a re-check is free: the
    // controller charges the use only when it has to ask the model.
    Route::post('/applications/{application}/ats', [AtsController::class, 'check'])->middleware('feature:ats_check,deferred');

    // Spoken playback. Returns base64 WAV, not the raw PCM Gemini gives us.
    Route::post('/tts', [TtsController::class, 'speak'])->middleware('feature:spoken_playback');
});
