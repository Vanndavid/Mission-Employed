<?php

namespace Tests\Feature;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use App\Enums\JobStatus;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\BehavioralAnswer;
use App\Models\CodingAttempt;
use App\Models\InterviewStage;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ModelSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_owns_a_profile_applications_attempts_and_ai_sessions(): void
    {
        $user = User::factory()->create();

        Profile::factory()->for($user)->create([
            'base_cv' => 'Base CV body',
            'portfolio_url' => 'https://example.test/portfolio',
        ]);

        $application = Application::factory()->for($user)->create([
            'company' => 'Northwind Systems',
            'status' => JobStatus::Interviewing,
            'offer' => null,
            'take_home' => ['deadline' => '2026-09-10', 'repo' => 'https://example.test/repo', 'status' => 'in_progress'],
        ]);

        InterviewStage::factory()->for($application)->createMany([
            ['type' => 'phone', 'scheduled_at' => now()->subWeek(), 'notes' => 'Screen'],
            ['type' => 'technical', 'scheduled_at' => now()->addWeek(), 'notes' => 'Pairing'],
        ]);

        ApplicationStatusEvent::factory()->for($application)->createMany([
            ['status' => JobStatus::Applied, 'occurred_at' => now()->subDays(20)],
            ['status' => JobStatus::Interviewing, 'occurred_at' => now()->subDays(5)],
        ]);

        BehavioralAnswer::factory()->for($user)->create([
            'theme_id' => 'failure',
            'bullets' => ['Broke prod', 'Owned it', 'Added a replay step'],
        ]);

        CodingAttempt::factory()->for($user)->create([
            'title' => 'Debounce an event stream',
            'topics' => ['concurrency', 'testing'],
            'completed' => true,
            'attempted_at' => now()->subDay(),
        ]);

        $session = AiSession::factory()->for($user)->create([
            'kind' => 'coding',
            'context' => ['title' => 'Debounce an event stream'],
            'report' => null,
        ]);

        // Inserted out of order on purpose — the relation must sort by sequence.
        AiMessage::factory()->for($session, 'session')->create(['role' => 'model', 'content' => 'Second', 'sequence' => 2]);
        AiMessage::factory()->for($session, 'session')->create(['role' => 'user', 'content' => 'First', 'sequence' => 1]);
        AiMessage::factory()->for($session, 'session')->create(['role' => 'model', 'content' => 'Third', 'sequence' => 3]);

        $fresh = User::with([
            'profile',
            'applications.interviewStages',
            'applications.statusEvents',
            'behavioralAnswers',
            'codingAttempts',
            'aiSessions.messages',
        ])->findOrFail($user->id);

        $this->assertSame('Base CV body', $fresh->profile->base_cv);
        $this->assertTrue($fresh->profile->user->is($fresh));

        $this->assertCount(1, $fresh->applications);
        $loadedApplication = $fresh->applications->first();
        $this->assertSame('Northwind Systems', $loadedApplication->company);
        $this->assertTrue($loadedApplication->user->is($fresh));

        $this->assertCount(2, $loadedApplication->interviewStages);
        $this->assertSame(['phone', 'technical'], $loadedApplication->interviewStages->pluck('type')->all());
        $this->assertTrue($loadedApplication->interviewStages->first()->application->is($loadedApplication));

        $this->assertCount(2, $loadedApplication->statusEvents);
        $this->assertSame(
            [JobStatus::Applied, JobStatus::Interviewing],
            $loadedApplication->statusEvents->pluck('status')->all()
        );

        $this->assertCount(1, $fresh->behavioralAnswers);
        $behavioral = $fresh->behavioralAnswers->first();
        $this->assertSame('failure', $behavioral->theme_id);
        $this->assertIsArray($behavioral->bullets);
        $this->assertSame(['Broke prod', 'Owned it', 'Added a replay step'], $behavioral->bullets);
        $this->assertTrue($behavioral->user->is($fresh));

        $this->assertCount(1, $fresh->codingAttempts);
        $this->assertTrue($fresh->codingAttempts->first()->user->is($fresh));

        $this->assertCount(1, $fresh->aiSessions);
        $loadedSession = $fresh->aiSessions->first();
        $this->assertSame(['First', 'Second', 'Third'], $loadedSession->messages->pluck('content')->all());
        $this->assertSame([1, 2, 3], $loadedSession->messages->pluck('sequence')->all());
        $this->assertTrue($loadedSession->messages->first()->session->is($loadedSession));
        $this->assertSame(4, $loadedSession->nextSequence());
    }

    public function test_casts_hydrate_json_dates_enums_and_booleans(): void
    {
        $user = User::factory()->admin()->create();

        $application = Application::factory()->for($user)->withOffer()->withTakeHome()->create([
            'status' => JobStatus::Offer,
            'date_applied' => '2026-07-01',
            'next_action_due' => '2026-09-01',
        ]);

        $attempt = CodingAttempt::factory()->for($user)->create([
            'topics' => ['graphs', 'bfs'],
            'completed' => false,
            'attempted_at' => '2026-08-01 09:30:00',
        ]);

        $session = AiSession::factory()->for($user)->withReport()->create([
            'context' => ['role' => 'Backend Engineer'],
        ]);

        $event = ApplicationStatusEvent::factory()->for($application)->create([
            'status' => JobStatus::Rejected,
            'occurred_at' => '2026-08-15 12:00:00',
        ]);

        $stage = InterviewStage::factory()->for($application)->create([
            'scheduled_at' => '2026-08-20 15:00:00',
        ]);

        $application = $application->fresh();
        $attempt = $attempt->fresh();
        $session = $session->fresh();
        $event = $event->fresh();
        $stage = $stage->fresh();

        $this->assertInstanceOf(AccountRole::class, $user->fresh()->role);
        $this->assertInstanceOf(AccountPlan::class, $user->fresh()->plan);

        $this->assertInstanceOf(JobStatus::class, $application->status);
        $this->assertSame(JobStatus::Offer, $application->status);
        $this->assertInstanceOf(JobStatus::class, $event->status);

        $this->assertIsArray($application->offer);
        $this->assertArrayHasKey('base', $application->offer);
        $this->assertIsArray($application->take_home);
        $this->assertArrayHasKey('status', $application->take_home);

        $this->assertInstanceOf(Carbon::class, $application->date_applied);
        $this->assertSame('2026-07-01', $application->date_applied->toDateString());
        $this->assertSame('2026-09-01', $application->next_action_due->toDateString());
        $this->assertInstanceOf(Carbon::class, $event->occurred_at);
        $this->assertInstanceOf(Carbon::class, $stage->scheduled_at);
        $this->assertInstanceOf(Carbon::class, $attempt->attempted_at);

        $this->assertIsArray($attempt->topics);
        $this->assertSame(['graphs', 'bfs'], $attempt->topics);
        $this->assertIsBool($attempt->completed);
        $this->assertFalse($attempt->completed);

        $this->assertIsArray($session->context);
        $this->assertIsArray($session->report);
        $this->assertArrayHasKey('score', $session->report);
    }

    public function test_premium_matches_the_frontend_rule(): void
    {
        $free = User::factory()->create();
        $premium = User::factory()->premium()->create();
        $admin = User::factory()->admin()->create();

        $this->assertFalse($free->isPremium());
        $this->assertTrue($premium->isPremium());
        $this->assertTrue($admin->isPremium());
        $this->assertTrue($admin->isAdmin());
        $this->assertFalse($premium->isAdmin());
        $this->assertSame(AccountPlan::Free, $free->effectivePlan());
        $this->assertSame(AccountPlan::Premium, $admin->effectivePlan());
    }

    public function test_user_defaults_are_free_and_user_role(): void
    {
        $user = User::create([
            'email' => 'defaults@example.test',
            'password' => 'secret-password',
        ]);

        $user = $user->fresh();

        $this->assertSame(AccountRole::User, $user->role);
        $this->assertSame(AccountPlan::Free, $user->plan);
        $this->assertNull($user->name);
        $this->assertNotSame('secret-password', $user->password);
    }

    public function test_deleting_a_user_cascades_to_every_owned_row(): void
    {
        $user = User::factory()->create();
        Profile::factory()->for($user)->create();
        $application = Application::factory()->for($user)->create();
        InterviewStage::factory()->for($application)->create();
        ApplicationStatusEvent::factory()->for($application)->create();
        CodingAttempt::factory()->for($user)->create();
        BehavioralAnswer::factory()->for($user)->create();
        $session = AiSession::factory()->for($user)->create();
        AiMessage::factory()->for($session, 'session')->create(['sequence' => 1]);

        $survivor = User::factory()->create();
        $survivorApplication = Application::factory()->for($survivor)->create();
        InterviewStage::factory()->for($survivorApplication)->create();

        $user->delete();

        $this->assertDatabaseMissing('profiles', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('applications', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('interview_stages', ['application_id' => $application->id]);
        $this->assertDatabaseMissing('application_status_events', ['application_id' => $application->id]);
        $this->assertDatabaseMissing('coding_attempts', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('behavioral_answers', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('ai_sessions', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('ai_messages', ['ai_session_id' => $session->id]);

        // The cascade is targeted, not a table wipe.
        $this->assertDatabaseHas('applications', ['id' => $survivorApplication->id]);
        $this->assertDatabaseHas('interview_stages', ['application_id' => $survivorApplication->id]);
    }

    public function test_deleting_an_application_cascades_to_its_children_only(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();
        $stage = InterviewStage::factory()->for($application)->create();
        $event = ApplicationStatusEvent::factory()->for($application)->create();

        $application->delete();

        $this->assertDatabaseMissing('interview_stages', ['id' => $stage->id]);
        $this->assertDatabaseMissing('application_status_events', ['id' => $event->id]);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_schema_carries_no_tables_for_deleted_features(): void
    {
        $tables = collect(DB::select("select name from sqlite_master where type = 'table'"))
            ->pluck('name')
            ->all();

        $expected = [
            'users', 'password_reset_tokens', 'sessions', 'cache', 'cache_locks',
            'jobs', 'job_batches', 'failed_jobs', 'personal_access_tokens',
            'profiles', 'applications', 'application_status_events',
            'interview_stages', 'behavioral_answers', 'coding_attempts',
            'ai_sessions', 'ai_messages',
        ];

        foreach ($expected as $table) {
            $this->assertContains($table, $tables, "Missing expected table [$table].");
        }

        $deletedFeatureTables = [
            'talent_scores', 'talent_rankings', 'contacts', 'analytics', 'daily_logs',
            'task_streaks', 'hunt_personas', 'criteria', 'offers', 'follow_up_emails',
            'system_designs',
        ];

        foreach ($deletedFeatureTables as $table) {
            $this->assertNotContains($table, $tables, "Deleted feature table [$table] should not exist.");
        }

        $this->assertNotContains('email_verified_at', collect(DB::select('pragma table_info(users)'))->pluck('name')->all());
    }

    public function test_behavioral_answers_are_unique_per_user_and_theme(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        BehavioralAnswer::factory()->for($user)->create([
            'theme_id' => 'pressure',
            'bullets' => ['Two-day turnaround'],
        ]);

        // A different user may hold the same theme.
        BehavioralAnswer::factory()->for($other)->create(['theme_id' => 'pressure']);

        // The same user may hold a different theme.
        BehavioralAnswer::factory()->for($user)->create(['theme_id' => 'failure']);

        $this->assertSame(2, $user->behavioralAnswers()->count());

        $this->expectException(UniqueConstraintViolationException::class);
        BehavioralAnswer::factory()->for($user)->create(['theme_id' => 'pressure']);
    }

    public function test_behavioral_answers_are_edited_in_place_by_theme(): void
    {
        $user = User::factory()->create();

        // What the PrepRoom save endpoint will do on every keystroke batch.
        foreach ([['first bullet'], ['first bullet', 'second bullet']] as $bullets) {
            BehavioralAnswer::updateOrCreate(
                ['user_id' => $user->id, 'theme_id' => 'impact'],
                ['bullets' => $bullets],
            );
        }

        $this->assertSame(1, $user->behavioralAnswers()->count());
        $this->assertSame(
            ['first bullet', 'second bullet'],
            $user->behavioralAnswers()->first()->bullets
        );
    }

    public function test_recruiter_contact_accessor_collapses_the_flattened_columns(): void
    {
        $user = User::factory()->create();

        $none = Application::factory()->for($user)->create([
            'recruiter_name' => null,
            'recruiter_email' => null,
            'recruiter_linkedin' => null,
        ]);

        $blank = Application::factory()->for($user)->create([
            'recruiter_name' => '',
            'recruiter_email' => '',
            'recruiter_linkedin' => '',
        ]);

        $partial = Application::factory()->for($user)->create([
            'recruiter_name' => 'Priya Raman',
            'recruiter_email' => null,
            'recruiter_linkedin' => '',
        ]);

        $this->assertNull($none->fresh()->recruiter_contact);
        $this->assertFalse($none->fresh()->hasRecruiter());

        // Blank strings from untouched form inputs read as "no recruiter".
        $this->assertNull($blank->fresh()->recruiter_contact);

        $this->assertSame(
            ['name' => 'Priya Raman', 'email' => '', 'linkedin' => ''],
            $partial->fresh()->recruiter_contact
        );
        $this->assertTrue($partial->fresh()->hasRecruiter());
    }
}
