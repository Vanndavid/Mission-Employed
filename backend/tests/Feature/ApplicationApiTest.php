<?php

namespace Tests\Feature;

use App\Enums\JobStatus;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\InterviewStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationApiTest extends TestCase
{
    use RefreshDatabase;

    /** The shape the client sends: camelCase, nested recruiter, '' for blanks. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'company' => 'Northwind Systems',
            'role' => 'Backend Engineer',
            'location' => 'Remote',
            'url' => 'https://northwind.test/jobs/1',
            'status' => JobStatus::Applied->value,
            'dateApplied' => '2026-08-01',
            'notes' => 'Referred by Sam',
            'jobDescription' => 'Build things.',
            'coverLetter' => '',
            'tailoredCV' => '',
            'nextAction' => 'Follow up',
            'nextActionDue' => '2026-08-15',
            'recruiterContact' => ['name' => 'Ada', 'email' => 'ada@northwind.test', 'linkedin' => ''],
        ], $overrides);
    }

    public function test_the_tracker_requires_a_token(): void
    {
        $this->getJson('/api/applications')->assertUnauthorized();
        $this->postJson('/api/applications', $this->payload())->assertUnauthorized();
    }

    public function test_it_lists_only_the_signed_in_users_applications(): void
    {
        $user = User::factory()->create();
        $mine = Application::factory()->for($user)->create(['company' => 'Mine Ltd']);
        Application::factory()->create(['company' => 'Theirs Ltd']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/applications')->assertOk();

        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.id', $mine->id);
        $response->assertJsonPath('data.0.company', 'Mine Ltd');
    }

    public function test_it_serializes_an_application_in_the_shape_the_client_expects(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create([
            'company' => 'Northwind Systems',
            'status' => JobStatus::Interviewing,
            'date_applied' => '2026-08-01',
            'next_action_due' => '2026-08-15',
            'job_description' => 'Build things.',
            'tailored_cv' => null,
        ]);
        InterviewStage::factory()->for($application)->create(['type' => 'system_design']);
        ApplicationStatusEvent::factory()->for($application)->create([
            'status' => JobStatus::Applied,
            'occurred_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson("/api/applications/{$application->id}")->assertOk();

        $response->assertJsonPath('data.company', 'Northwind Systems');
        $response->assertJsonPath('data.status', 'Interviewing');
        $response->assertJsonPath('data.dateApplied', '2026-08-01');
        $response->assertJsonPath('data.nextActionDue', '2026-08-15');
        $response->assertJsonPath('data.jobDescription', 'Build things.');
        // A null text column reads back as '', not null: the client types it
        // as a string and puts it straight into a textarea.
        $response->assertJsonPath('data.tailoredCV', '');
        $response->assertJsonPath('data.interviewStages.0.type', 'system_design');
        $response->assertJsonPath('data.statusHistory.0.status', 'Applied');
    }

    public function test_it_creates_an_application_and_logs_the_initial_status_event(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/applications', $this->payload())->assertCreated();

        $application = Application::sole();
        $this->assertSame($user->id, $application->user_id);
        $this->assertSame(JobStatus::Applied, $application->status);
        $response->assertJsonPath('data.id', $application->id);
        $response->assertJsonPath('data.interviewStages', []);

        // Creation is the first entry in the timeline, not a gap before it.
        $this->assertCount(1, $application->statusEvents);
        $this->assertSame(JobStatus::Applied, $application->statusEvents->first()->status);
    }

    public function test_a_new_application_defaults_to_saved(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', ['company' => 'Acme', 'role' => 'Engineer'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'Saved');

        $this->assertSame(JobStatus::Saved, Application::sole()->statusEvents->first()->status);
    }

    public function test_a_new_application_is_not_important_until_it_is_starred(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', ['company' => 'Acme', 'role' => 'Engineer'])
            ->assertCreated()
            ->assertJsonPath('data.isImportant', false);

        $application = Application::sole();

        $this->patchJson("/api/applications/{$application->id}", ['isImportant' => true])
            ->assertOk()
            ->assertJsonPath('data.isImportant', true);

        $this->assertTrue($application->fresh()->is_important);

        // Unstarring is the same request with the flag flipped — no separate
        // endpoint, so a false must not be read as "field absent".
        $this->patchJson("/api/applications/{$application->id}", ['isImportant' => false])
            ->assertOk()
            ->assertJsonPath('data.isImportant', false);

        $this->assertFalse($application->fresh()->is_important);
    }

    public function test_starring_an_application_logs_no_status_event(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['status' => JobStatus::Applied]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", ['isImportant' => true])->assertOk();

        $this->assertCount(0, $application->fresh()->statusEvents);
    }

    public function test_blank_dates_are_stored_as_null(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/applications', $this->payload([
            'dateApplied' => '',
            'nextActionDue' => '',
        ]))->assertCreated();

        $application = Application::sole();
        $this->assertNull($application->date_applied);
        $this->assertNull($application->next_action_due);
        // And the raw column is null rather than an empty string SQLite kept.
        $this->assertDatabaseHas('applications', [
            'id' => $application->id,
            'date_applied' => null,
            'next_action_due' => null,
        ]);
        $response->assertJsonPath('data.dateApplied', '');
        $response->assertJsonPath('data.nextActionDue', '');
    }

    public function test_it_flattens_the_nested_recruiter_contact(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/applications', $this->payload())->assertCreated();

        $application = Application::sole();
        $this->assertSame('Ada', $application->recruiter_name);
        $this->assertSame('ada@northwind.test', $application->recruiter_email);
        $this->assertNull($application->recruiter_linkedin);

        // Round-trips back out as the nested object, blanks filled in.
        $response->assertJsonPath('data.recruiterContact.name', 'Ada');
        $response->assertJsonPath('data.recruiterContact.email', 'ada@northwind.test');
        $response->assertJsonPath('data.recruiterContact.linkedin', '');
    }

    public function test_an_all_blank_recruiter_serializes_as_null(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/applications', $this->payload([
            'recruiterContact' => ['name' => '', 'email' => '', 'linkedin' => ''],
        ]))->assertCreated();

        $response->assertJsonPath('data.recruiterContact', null);
    }

    public function test_a_status_change_appends_exactly_one_event(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['status' => JobStatus::Applied]);
        ApplicationStatusEvent::factory()->for($application)->create(['status' => JobStatus::Applied]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", [
            'status' => JobStatus::Interviewing->value,
            'notes' => 'Phone screen booked',
        ])->assertOk()->assertJsonPath('data.status', 'Interviewing');

        $events = $application->fresh()->statusEvents;
        $this->assertCount(2, $events);
        $this->assertSame(JobStatus::Interviewing, $events->last()->status);
        $this->assertSame(JobStatus::Interviewing, $application->fresh()->status);
    }

    public function test_an_update_that_leaves_the_status_alone_logs_nothing(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['status' => JobStatus::Applied]);
        ApplicationStatusEvent::factory()->for($application)->create(['status' => JobStatus::Applied]);

        Sanctum::actingAs($user);

        // Both a field edit and a status resent unchanged: neither is a move.
        $this->patchJson("/api/applications/{$application->id}", [
            'notes' => 'Still waiting',
            'status' => JobStatus::Applied->value,
        ])->assertOk();

        $this->assertCount(1, $application->fresh()->statusEvents);
    }

    public function test_a_patch_only_touches_the_fields_it_sends(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create([
            'company' => 'Northwind Systems',
            'notes' => 'Original note',
        ]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", ['notes' => 'Edited'])
            ->assertOk()
            ->assertJsonPath('data.company', 'Northwind Systems');

        $this->assertSame('Edited', $application->fresh()->notes);
    }

    public function test_it_deletes_an_application(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();
        InterviewStage::factory()->for($application)->create();

        Sanctum::actingAs($user);

        $this->deleteJson("/api/applications/{$application->id}")->assertNoContent();

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
        $this->assertDatabaseMissing('interview_stages', ['application_id' => $application->id]);
    }

    public function test_another_users_application_is_404_on_every_route(): void
    {
        $user = User::factory()->create();
        $theirs = Application::factory()->create(['company' => 'Theirs Ltd']);

        Sanctum::actingAs($user);

        // 404 rather than 403 — a 403 would confirm the record exists.
        $this->getJson("/api/applications/{$theirs->id}")->assertNotFound();
        $this->patchJson("/api/applications/{$theirs->id}", ['company' => 'Hijacked'])->assertNotFound();
        $this->deleteJson("/api/applications/{$theirs->id}")->assertNotFound();

        $this->assertDatabaseHas('applications', ['id' => $theirs->id, 'company' => 'Theirs Ltd']);
    }

    public function test_a_bad_body_on_another_users_application_is_still_404(): void
    {
        $user = User::factory()->create();
        $theirs = Application::factory()->create();

        Sanctum::actingAs($user);

        // A 422 here would leak that the row exists, so ownership is settled
        // before validation runs.
        $this->patchJson("/api/applications/{$theirs->id}", ['status' => 'Nonsense'])
            ->assertNotFound();
    }

    public function test_it_stores_the_source_a_spreadsheet_import_supplies(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', $this->payload(['source' => 'Seek']))
            ->assertCreated()
            ->assertJsonPath('data.source', 'Seek');

        $this->assertSame('Seek', Application::sole()->source);
    }

    public function test_it_patches_and_blanks_the_source(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['source' => 'LinkedIn']);

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", ['source' => 'Company site'])
            ->assertOk()
            ->assertJsonPath('data.source', 'Company site');

        // '' is how the client says "cleared", and a nullable column should get
        // null rather than an empty string.
        $this->patchJson("/api/applications/{$application->id}", ['source' => ''])
            ->assertOk()
            ->assertJsonPath('data.source', '');

        $this->assertNull($application->fresh()->source);
    }

    public function test_it_stores_the_screening_questions_a_rejection_cited(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $reasons = [
            'Which of the following statements best describes your right to work in Australia?',
            "How many years' experience do you have as a software engineer?",
        ];

        $this->patchJson("/api/applications/{$application->id}", ['rejectionReasons' => $reasons])
            ->assertOk()
            ->assertJsonPath('data.rejectionReasons', $reasons);

        $this->assertSame($reasons, $application->fresh()->rejection_reasons);
    }

    public function test_rejection_reasons_serialize_as_an_empty_list_when_unset(): void
    {
        $user = User::factory()->create();
        Application::factory()->for($user)->create(['rejection_reasons' => null]);

        Sanctum::actingAs($user);

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.rejectionReasons', []);
    }

    public function test_it_rejects_rejection_reasons_that_are_not_a_list_of_strings(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", ['rejectionReasons' => 'right to work'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rejectionReasons');

        $this->patchJson("/api/applications/{$application->id}", ['rejectionReasons' => [['nested']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rejectionReasons.0');
    }

    public function test_an_unset_source_serializes_as_an_empty_string(): void
    {
        $user = User::factory()->create();
        Application::factory()->for($user)->create(['source' => null]);

        Sanctum::actingAs($user);

        $this->getJson('/api/applications')->assertOk()->assertJsonPath('data.0.source', '');
    }

    public function test_it_backdates_the_first_status_event_to_a_supplied_status_date(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', $this->payload([
            'status' => JobStatus::Rejected->value,
            'statusDate' => '2026-09-18',
        ]))->assertCreated();

        $event = Application::sole()->statusEvents->sole();

        $this->assertSame(JobStatus::Rejected, $event->status);
        $this->assertSame('2026-09-18', $event->occurred_at->format('Y-m-d'));
    }

    public function test_it_stamps_the_first_status_event_now_without_a_status_date(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', $this->payload())->assertCreated();

        $event = Application::sole()->statusEvents->sole();

        $this->assertTrue($event->occurred_at->isToday());
    }

    public function test_status_date_is_not_written_as_a_column(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // It is validated but absent from COLUMN_MAP, so it must reach the
        // event log and nothing else.
        $this->postJson('/api/applications', $this->payload(['statusDate' => '2026-09-18']))
            ->assertCreated()
            ->assertJsonMissingPath('data.statusDate');

        $this->assertFalse(Schema::hasColumn('applications', 'status_date'));
    }

    public function test_it_backdates_the_event_for_a_status_change(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['status' => JobStatus::Applied]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/applications/{$application->id}", [
            'status' => JobStatus::Rejected->value,
            'statusDate' => '2026-09-15',
        ])->assertOk();

        $event = $application->fresh()->statusEvents->sole();

        $this->assertSame(JobStatus::Rejected, $event->status);
        $this->assertSame('2026-09-15', $event->occurred_at->format('Y-m-d'));
    }

    public function test_a_status_date_without_a_status_change_records_nothing(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create(['status' => JobStatus::Applied]);

        Sanctum::actingAs($user);

        // The guard that keeps re-importing a spreadsheet idempotent: filling a
        // blank field must not pile up status events.
        $this->patchJson("/api/applications/{$application->id}", [
            'status' => JobStatus::Applied->value,
            'statusDate' => '2026-09-15',
            'notes' => 'Filled in from the sheet',
        ])->assertOk();

        $this->assertCount(0, $application->fresh()->statusEvents);
    }

    public function test_status_history_orders_a_backdated_event_first(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $created = $this->postJson('/api/applications', $this->payload([
            'status' => JobStatus::Applied->value,
            'statusDate' => '2026-08-01',
        ]))->assertCreated();

        $id = $created->json('data.id');

        $response = $this->patchJson("/api/applications/{$id}", [
            'status' => JobStatus::Rejected->value,
            'statusDate' => '2026-09-10',
        ])->assertOk();

        $this->assertSame(
            ['Applied', 'Rejected'],
            array_column($response->json('data.statusHistory'), 'status'),
        );
    }

    public function test_it_rejects_a_status_date_that_is_not_a_date(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', $this->payload(['statusDate' => 'whenever']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('statusDate');
    }

    public function test_it_validates_the_payload(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/applications', ['role' => 'Engineer'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('company');

        $this->postJson('/api/applications', $this->payload(['status' => 'Ghosted']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->postJson('/api/applications', $this->payload(['dateApplied' => 'whenever']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('dateApplied');
    }
}
