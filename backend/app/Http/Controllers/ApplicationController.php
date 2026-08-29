<?php

namespace App\Http\Controllers;

use App\Http\Concerns\GuardsApplicationOwnership;
use App\Http\Requests\Tracker\StoreApplicationRequest;
use App\Http\Requests\Tracker\UpdateApplicationRequest;
use App\Http\Resources\ApplicationResource;
use App\Models\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * The job application tracker.
 *
 * Status lives in two places — the current value on `applications` and the
 * `application_status_events` log the timeline reads. recordStatusEvent() is
 * the only writer of that log in this codebase, and both the create path and
 * the update path go through it, so the two cannot drift apart.
 */
class ApplicationController extends Controller
{
    use GuardsApplicationOwnership;

    /** Everything a serialized application needs, loaded in one go. */
    private const RELATIONS = ['interviewStages', 'statusEvents'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $applications = $request->user()->applications()
            ->with(self::RELATIONS)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return ApplicationResource::collection($applications);
    }

    public function store(StoreApplicationRequest $request): JsonResponse
    {
        $application = DB::transaction(function () use ($request): Application {
            $application = $request->user()->applications()->create($request->columns());

            // The timeline starts at creation, not at the first change.
            $this->recordStatusEvent($application);

            return $application;
        });

        return (new ApplicationResource($application->load(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Application $application): ApplicationResource
    {
        $this->guardApplicationOwnership($application, $request->user());

        return new ApplicationResource($application->load(self::RELATIONS));
    }

    public function update(UpdateApplicationRequest $request, Application $application): ApplicationResource
    {
        // Ownership is already settled in the form request's authorize(), which
        // runs before validation; this is the same check, kept explicit.
        $this->guardApplicationOwnership($application, $request->user());

        DB::transaction(function () use ($request, $application): void {
            $application->fill($request->columns());

            // Ask before saving — afterwards the change is no longer dirty.
            $statusChanged = $application->isDirty('status');

            $application->save();

            if ($statusChanged) {
                $this->recordStatusEvent($application);
            }
        });

        return new ApplicationResource($application->load(self::RELATIONS));
    }

    public function destroy(Request $request, Application $application): Response
    {
        $this->guardApplicationOwnership($application, $request->user());

        // Stages and status events cascade with the row.
        $application->delete();

        return response()->noContent();
    }

    /**
     * Append the application's current status to its event log. The single
     * place any status event is written.
     */
    private function recordStatusEvent(Application $application): void
    {
        $application->statusEvents()->create([
            'status' => $application->status,
            'occurred_at' => now(),
        ]);
    }
}
