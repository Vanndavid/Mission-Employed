<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\InterviewStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationStageApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_stage_routes_require_a_token(): void
    {
        $application = Application::factory()->create();

        $this->postJson("/api/applications/{$application->id}/stages", ['type' => 'phone'])
            ->assertUnauthorized();
    }

    public function test_it_adds_a_stage_to_an_application(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $response = $this->postJson("/api/applications/{$application->id}/stages", [
            'type' => 'system_design',
            'scheduledAt' => '2026-09-10T14:00:00',
            'notes' => 'With the platform team',
        ])->assertCreated();

        $stage = InterviewStage::sole();
        $this->assertSame($application->id, $stage->application_id);
        $this->assertSame('system_design', $stage->type);
        $response->assertJsonPath('data.id', $stage->id);
        $response->assertJsonPath('data.notes', 'With the platform team');
    }

    public function test_a_stage_with_no_schedule_is_accepted(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/applications/{$application->id}/stages", [
            'type' => 'phone',
            'scheduledAt' => '',
            'notes' => '',
        ])->assertCreated()->assertJsonPath('data.scheduledAt', '');

        $this->assertNull(InterviewStage::sole()->scheduled_at);
    }

    public function test_it_rejects_an_unknown_stage_type(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/applications/{$application->id}/stages", ['type' => 'vibes'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }

    public function test_it_deletes_a_stage(): void
    {
        $user = User::factory()->create();
        $application = Application::factory()->for($user)->create();
        $stage = InterviewStage::factory()->for($application)->create();

        Sanctum::actingAs($user);

        $this->deleteJson("/api/applications/{$application->id}/stages/{$stage->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('interview_stages', ['id' => $stage->id]);
    }

    public function test_stages_on_another_users_application_are_404(): void
    {
        $user = User::factory()->create();
        $theirApplication = Application::factory()->create();
        $theirStage = InterviewStage::factory()->for($theirApplication)->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/applications/{$theirApplication->id}/stages", ['type' => 'phone'])
            ->assertNotFound();
        $this->deleteJson("/api/applications/{$theirApplication->id}/stages/{$theirStage->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('interview_stages', ['id' => $theirStage->id]);
        $this->assertDatabaseCount('interview_stages', 1);
    }

    public function test_a_stage_id_from_another_application_is_404(): void
    {
        $user = User::factory()->create();
        $mine = Application::factory()->for($user)->create();
        // The stage exists and the application in the URL is mine — but the
        // stage hangs off someone else's application, so it is not addressable
        // through this one.
        $theirStage = InterviewStage::factory()->for(Application::factory()->create())->create();

        Sanctum::actingAs($user);

        $this->deleteJson("/api/applications/{$mine->id}/stages/{$theirStage->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('interview_stages', ['id' => $theirStage->id]);
    }

    public function test_a_stage_id_from_another_of_my_own_applications_is_404(): void
    {
        $user = User::factory()->create();
        $first = Application::factory()->for($user)->create();
        $second = Application::factory()->for($user)->create();
        $stage = InterviewStage::factory()->for($second)->create();

        Sanctum::actingAs($user);

        $this->deleteJson("/api/applications/{$first->id}/stages/{$stage->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('interview_stages', ['id' => $stage->id]);
    }
}
