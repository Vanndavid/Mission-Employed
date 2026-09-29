<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\AtsCheckRequest;
use App\Models\Application;
use App\Services\Ats\AtsCheck;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * The ATS score check of one tracked application's CV against its job.
 *
 * New with the Laravel API; the Express server had nothing like it. Its
 * "criteria scoring" was a different, deleted feature — it scored a job
 * against the user's wish-list and never looked at a CV.
 */
class AtsController extends AiController
{
    public function check(AtsCheckRequest $request, Application $application, AtsCheck $ats): JsonResponse
    {
        // Ownership was settled in the form request's authorize().
        try {
            $report = $ats->run($application, $request->validated('source'), $request->user()->profile?->base_cv);
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'ATS keyword extraction');
        }

        return response()->json($report);
    }
}
