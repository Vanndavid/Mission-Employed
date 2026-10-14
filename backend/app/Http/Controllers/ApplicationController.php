<?php

namespace App\Http\Controllers;

use App\Enums\JobStatus;
use App\Http\Concerns\GuardsApplicationOwnership;
use App\Http\Requests\Tracker\StoreApplicationRequest;
use App\Http\Requests\Tracker\UpdateApplicationRequest;
use App\Http\Resources\ApplicationResource;
use App\Models\Application;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
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
 * the only writer of that log in this codebase, and the create path, the
 * update path and the Ghosted sweep all go through it, so the two cannot drift
 * apart.
 */
class ApplicationController extends Controller
{
    use GuardsApplicationOwnership;

    /** Everything a serialized application needs, loaded in one go. */
    private const RELATIONS = ['interviewStages', 'statusEvents'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->ghostUnanswered($request->user());

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

            // The timeline starts at creation, not at the first change. An
            // import supplies statusDate so the first event carries the date
            // from the spreadsheet rather than today; it seeds one event, not a
            // synthetic Applied -> Rejected pair.
            $this->recordStatusEvent($application, $request->validated('statusDate'));

            return $application;
        });

        return (new ApplicationResource($application->load(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Application $application): ApplicationResource
    {
        $this->guardApplicationOwnership($application, $request->user());

        $this->ghostUnanswered($request->user());

        return new ApplicationResource($application->refresh()->load(self::RELATIONS));
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

            // Gated on the status actually changing, statusDate or not: a
            // patch that only fills a blank field must not log an event, or
            // re-importing the same spreadsheet would pile up duplicates.
            if ($statusChanged) {
                $this->recordStatusEvent($application, $request->validated('statusDate'));
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
     * Move the user's applications that have sat at Applied for
     * Application::GHOSTED_AFTER_DAYS with no reply on to Ghosted.
     *
     * Done when the tracker is read rather than on a schedule: the deployment
     * runs no scheduler, and nobody can see the status until they read it.
     * The event is dated when the silence crossed the line, not when someone
     * looked, so the timeline reads the same however late this runs.
     *
     * "No reply" means no status change since applying and no interview on
     * the books — a stage is the employer answering, whatever the status says.
     */
    private function ghostUnanswered(User $user): void
    {
        $cutoff = CarbonImmutable::now()->subDays(Application::GHOSTED_AFTER_DAYS);

        $candidates = $user->applications()
            ->where('status', JobStatus::Applied)
            ->whereDoesntHave('interviewStages')
            ->with('statusEvents')
            ->get();

        foreach ($candidates as $application) {
            $lastHeard = $application->lastHeardAt();

            if ($lastHeard->greaterThan($cutoff)) {
                continue;
            }

            DB::transaction(function () use ($application, $lastHeard): void {
                $application->update(['status' => JobStatus::Ghosted]);
                $this->recordStatusEvent($application, $lastHeard->addDays(Application::GHOSTED_AFTER_DAYS));
            });
        }
    }

    /**
     * Append the application's current status to its event log. The single
     * place any status event is written.
     *
     * $occurredAt backdates the entry, for an import carrying the date the
     * status actually changed. Absent, the event is stamped now().
     */
    private function recordStatusEvent(Application $application, CarbonInterface|string|null $occurredAt = null): void
    {
        $application->statusEvents()->create([
            'status' => $application->status,
            'occurred_at' => $occurredAt === null ? now() : CarbonImmutable::parse($occurredAt),
        ]);
    }
}
