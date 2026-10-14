<?php

namespace Tests\Feature;

use App\Enums\JobStatus;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\InterviewStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * An application left at Applied with no reply for a month moves itself on to
 * Ghosted when the tracker is read.
 */
class GhostedApplicationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-10-15 09:00:00');
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    /** Applied on $appliedOn, with the event the API would have logged then. */
    private function appliedOn(string $appliedOn, ?User $owner = null): Application
    {
        $application = Application::factory()->for($owner ?? $this->user)->create([
            'status' => JobStatus::Applied,
            'date_applied' => $appliedOn,
        ]);
        ApplicationStatusEvent::factory()->for($application)->create([
            'status' => JobStatus::Applied,
            'occurred_at' => $appliedOn.' 10:00:00',
        ]);

        return $application;
    }

    public function test_thirty_days_at_applied_with_no_reply_is_ghosted(): void
    {
        $application = $this->appliedOn('2026-09-14');

        $response = $this->getJson('/api/applications')->assertOk();

        $response->assertJsonPath('data.0.status', 'Ghosted');
        $this->assertSame(JobStatus::Ghosted, $application->fresh()->status);
    }

    public function test_the_event_is_dated_when_the_month_ran_out_not_when_it_was_noticed(): void
    {
        $this->appliedOn('2026-08-01');

        $history = $this->getJson('/api/applications')->assertOk()->json('data.0.statusHistory');

        $this->assertSame(['Applied', 'Ghosted'], array_column($history, 'status'));
        $this->assertStringStartsWith('2026-08-31T10:00:00', $history[1]['date']);
    }

    public function test_twenty_nine_days_is_still_applied(): void
    {
        $application = $this->appliedOn('2026-09-16');

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.status', 'Applied');
        $this->assertCount(1, $application->statusEvents()->get());
    }

    public function test_the_clock_runs_from_the_latest_status_change(): void
    {
        // Applied long ago, but put back to Applied ten days ago — after a
        // ghosting turned out to be premature, say.
        $application = $this->appliedOn('2026-07-01');
        ApplicationStatusEvent::factory()->for($application)->create([
            'status' => JobStatus::Applied,
            'occurred_at' => '2026-10-05 10:00:00',
        ]);

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.status', 'Applied');
    }

    public function test_the_clock_runs_from_the_date_applied_when_that_is_later(): void
    {
        $application = $this->appliedOn('2026-08-01');
        $application->update(['date_applied' => '2026-10-01']);

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.status', 'Applied');
    }

    public function test_an_interview_on_the_books_counts_as_a_reply(): void
    {
        $application = $this->appliedOn('2026-08-01');
        InterviewStage::factory()->for($application)->create();

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.status', 'Applied');
    }

    public function test_only_applied_applications_are_ghosted(): void
    {
        foreach ([JobStatus::Saved, JobStatus::Interviewing, JobStatus::Offer, JobStatus::Rejected] as $status) {
            $application = Application::factory()->for($this->user)->create([
                'status' => $status,
                'date_applied' => '2026-06-01',
            ]);
            ApplicationStatusEvent::factory()->for($application)->create([
                'status' => $status,
                'occurred_at' => '2026-06-01 10:00:00',
            ]);
        }

        $statuses = array_column($this->getJson('/api/applications')->assertOk()->json('data'), 'status');

        $this->assertEqualsCanonicalizing(['Saved', 'Interviewing', 'Offer', 'Rejected'], $statuses);
    }

    public function test_reading_twice_logs_one_event(): void
    {
        $application = $this->appliedOn('2026-08-01');

        $this->getJson('/api/applications')->assertOk();
        $this->getJson('/api/applications')->assertOk();

        $this->assertSame(
            [JobStatus::Applied, JobStatus::Ghosted],
            $application->statusEvents()->get()->pluck('status')->all(),
        );
    }

    public function test_reading_one_application_ghosts_it_too(): void
    {
        $application = $this->appliedOn('2026-08-01');

        $this->getJson("/api/applications/{$application->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'Ghosted');
    }

    public function test_it_leaves_other_users_applications_alone(): void
    {
        $theirs = $this->appliedOn('2026-08-01', User::factory()->create());

        $this->getJson('/api/applications')->assertOk();

        $this->assertSame(JobStatus::Applied, $theirs->fresh()->status);
    }

    public function test_a_reply_moves_a_ghosted_application_on(): void
    {
        $application = $this->appliedOn('2026-08-01');
        $this->getJson('/api/applications')->assertOk();

        $this->patchJson("/api/applications/{$application->id}", ['status' => 'Interviewing'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Interviewing');
    }

    public function test_it_can_be_set_by_hand(): void
    {
        $application = Application::factory()->for($this->user)->status(JobStatus::Interviewing)->create();

        $this->patchJson("/api/applications/{$application->id}", ['status' => 'Ghosted'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Ghosted');
    }
}
