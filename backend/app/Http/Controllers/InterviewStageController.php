<?php

namespace App\Http\Controllers;

use App\Http\Concerns\GuardsApplicationOwnership;
use App\Http\Requests\Tracker\StoreInterviewStageRequest;
use App\Http\Resources\InterviewStageResource;
use App\Models\Application;
use App\Models\InterviewStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Interview stages hang off an application and are only ever addressed through
 * one. The route uses scoped bindings, so a stage id that belongs to a
 * different application is a 404 before this controller runs; the ownership
 * guard covers the application itself.
 */
class InterviewStageController extends Controller
{
    use GuardsApplicationOwnership;

    public function store(StoreInterviewStageRequest $request, Application $application): JsonResponse
    {
        $stage = $application->interviewStages()->create($request->columns());

        return (new InterviewStageResource($stage))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, Application $application, InterviewStage $interviewStage): Response
    {
        $this->guardApplicationOwnership($application, $request->user());

        $interviewStage->delete();

        return response()->noContent();
    }
}
