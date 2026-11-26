<?php

namespace App\Http\Controllers\Practice;

use App\Http\Controllers\Controller;
use App\Services\Practice\PracticeProgressReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/practice/progress: how practice is going in every mode, from the
 * user's own attempts ({@see PracticeProgressReport}). A read of their own
 * data, so it names no plan feature and never calls a model. Flat JSON.
 */
class PracticeProgressController extends Controller
{
    public function __invoke(Request $request, PracticeProgressReport $report): JsonResponse
    {
        return response()->json($report->for($request->user()));
    }
}
