<?php

use App\Http\Controllers\Ai\BehavioralController;
use App\Http\Controllers\Ai\CodingController;
use App\Http\Controllers\Ai\DocumentController;
use App\Http\Controllers\Ai\JobController;
use App\Http\Controllers\Ai\MockInterviewController;
use App\Http\Controllers\Ai\SessionMessageController;
use App\Http\Controllers\Ai\TtsController;
use Illuminate\Support\Facades\Route;

// AI routes. Owned by task 2.3 in TASKS.md.
//
// Every model call costs money and every one of these is a paid feature, so the
// whole group sits behind auth:sanctum + premium. The client's PremiumGate is a
// courtesy that shows an upgrade prompt; this is the enforcement.
//
// Ported from the /ai/* routes in server/index.js. Three shapes changed:
//   - chat sessions are rows in ai_sessions, not keys in an in-memory Map, so
//     they survive a restart and a second worker;
//   - the three near-identical */chat routes collapsed into one
//     /ai/sessions/{session}/messages;
//   - system design, criteria scoring, follow-up emails and negotiation
//     scripts are gone with the features that used them.

Route::prefix('ai')->middleware(['auth:sanctum', 'premium'])->group(function (): void {
    // Coding practice.
    Route::post('/coding/problem', [CodingController::class, 'problem']);
    Route::post('/coding/sessions', [CodingController::class, 'store']);

    // One turn of any stored chat session (coding tutor today; cover_letter and
    // cv refinement if those sessions come back). Mock interviews use their own
    // turn route below — they need JSON and inline audio.
    Route::post('/sessions/{session}/messages', [SessionMessageController::class, 'store']);

    // One-question interview practice.
    Route::post('/behavioral/prompt', [BehavioralController::class, 'prompt']);
    Route::post('/behavioral/evaluate', [BehavioralController::class, 'evaluate']);

    // Full mock interview.
    Route::post('/mock/sessions', [MockInterviewController::class, 'store']);
    Route::post('/mock/sessions/{session}/turns', [MockInterviewController::class, 'turn']);
    Route::post('/mock/sessions/{session}/report', [MockInterviewController::class, 'report']);

    // Tracker: paste a job description, get fields back.
    Route::post('/job/parse', [JobController::class, 'parse']);

    // Tailored application documents.
    Route::post('/cover-letter/generate', [DocumentController::class, 'coverLetter']);
    Route::post('/cv/generate', [DocumentController::class, 'cv']);

    // Spoken playback. Returns base64 WAV, not the raw PCM Gemini gives us.
    Route::post('/tts', [TtsController::class, 'speak']);
});
