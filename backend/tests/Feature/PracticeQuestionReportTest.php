<?php

namespace Tests\Feature;

use App\Models\FeatureUsage;
use App\Models\PracticeQuestion;
use App\Models\PracticeQuestionReport;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A user who thinks a question is wrong says so. One report per user per
 * question stays open until an admin resolves it on the question bank.
 */
class PracticeQuestionReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_needs_a_token(): void
    {
        $question = PracticeQuestion::factory()->create();

        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => 'Wrong key'])->assertUnauthorized();
    }

    public function test_a_user_reports_a_published_question(): void
    {
        $gemini = FakeGeminiService::swap();
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $question = PracticeQuestion::factory()->create();

        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => '  The key should be B.  '])
            ->assertCreated()
            ->assertExactJson(['reported' => true]);

        $report = PracticeQuestionReport::sole();
        $this->assertSame($question->id, $report->practice_question_id);
        $this->assertSame($user->id, $report->user_id);
        $this->assertSame('The key should be B.', $report->reason);
        $this->assertNull($report->resolved_at);
        $gemini->assertNothingSent();
        $this->assertSame(0, FeatureUsage::count());
    }

    public function test_one_open_report_per_user_per_question(): void
    {
        $question = PracticeQuestion::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => 'Wrong key'])->assertCreated();
        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => 'Still wrong'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'already_reported');

        // Someone else's report is their own.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => 'Ambiguous'])->assertCreated();

        $this->assertSame(['Wrong key', 'Ambiguous'], PracticeQuestionReport::orderBy('id')->pluck('reason')->all());
    }

    public function test_once_resolved_the_same_user_can_report_it_again(): void
    {
        $user = User::factory()->create();
        $question = PracticeQuestion::factory()->create();
        PracticeQuestionReport::factory()->for($question, 'question')->for($user)->resolved()->create(['reason' => 'Old']);
        Sanctum::actingAs($user);

        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => 'Wrong again'])->assertCreated();

        $report = PracticeQuestionReport::sole();
        $this->assertSame('Wrong again', $report->reason);
        $this->assertNull($report->resolved_at);
    }

    public function test_a_draft_or_unknown_question_is_a_404(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $draft = PracticeQuestion::factory()->draft()->create();

        $this->postJson("/api/practice/questions/{$draft->id}/report", ['reason' => 'Wrong'])->assertNotFound();
        $this->postJson('/api/practice/questions/999/report', ['reason' => 'Wrong'])->assertNotFound();

        $this->assertSame(0, PracticeQuestionReport::count());
    }

    public function test_it_needs_a_reason(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $question = PracticeQuestion::factory()->create();

        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => '   '])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
        $this->postJson("/api/practice/questions/{$question->id}/report", ['reason' => str_repeat('x', 1001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->assertSame(0, PracticeQuestionReport::count());
    }
}
