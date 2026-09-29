<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiAtsScoreTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Application $application;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->premium()->create();
        $this->user->profile()->create(['base_cv' => 'Ten years of PHP.']);
        Sanctum::actingAs($this->user);

        $this->application = Application::factory()->for($this->user)->create([
            'role' => 'Senior Software Engineer',
            'job_description' => 'Run our PHP services on Kubernetes. GraphQL a plus.',
            'tailored_cv' => 'Ran PHP on K8s for five years.',
        ]);
    }

    public function test_it_scores_the_tailored_cv_against_the_job_description(): void
    {
        $gemini = FakeGeminiService::swap()->queueJson($this->keywords());

        $response = $this->check()
            ->assertOk()
            ->assertJsonPath('source', 'tailored')
            ->assertJsonPath('stale', false)
            ->assertJsonPath('keywords', ['matched' => 2, 'total' => 3])
            ->assertJsonPath('matched.1', ['term' => 'Kubernetes', 'kind' => 'skill', 'required' => true])
            ->assertJsonPath('missing', [['term' => 'GraphQL', 'kind' => 'skill', 'required' => false]]);

        // The hashes that decide staleness stay on the server.
        $this->assertSame(
            ['score', 'keywords', 'matched', 'missing', 'checks', 'source', 'checkedAt', 'stale'],
            array_keys($response->json()),
        );
        $this->assertIsInt($response->json('score'));
        $this->assertSame(['contact', 'sections', 'title', 'length', 'measurable'], array_column($response->json('checks'), 'id'));

        $gemini->assertCallCount('generateJson', 1)
            ->assertPromptContains('Role: Senior Software Engineer')
            ->assertPromptContains('Run our PHP services on Kubernetes. GraphQL a plus.');

        $schema = $gemini->lastCall('generateJson')['responseSchema'];
        $this->assertSame(['term', 'aliases', 'kind', 'required'], array_keys($schema['properties']['keywords']['items']['properties']));
        $this->assertSame(['skill', 'qualification', 'soft_skill'], $schema['properties']['keywords']['items']['properties']['kind']['enum']);
    }

    public function test_it_falls_back_to_the_base_cv_without_a_tailored_one(): void
    {
        $this->application->update(['tailored_cv' => null]);
        FakeGeminiService::swap()->queueJson($this->keywords());

        $this->check()
            ->assertOk()
            ->assertJsonPath('source', 'base')
            ->assertJsonPath('keywords', ['matched' => 1, 'total' => 3]);
    }

    public function test_it_scores_the_base_cv_when_asked_even_with_a_tailored_one(): void
    {
        FakeGeminiService::swap()->queueJson($this->keywords());

        $this->check(['source' => 'base'])
            ->assertOk()
            ->assertJsonPath('source', 'base')
            ->assertJsonPath('keywords', ['matched' => 1, 'total' => 3]);
    }

    public function test_the_keywords_are_extracted_once_per_role_and_job_description(): void
    {
        $gemini = FakeGeminiService::swap()->queueJson($this->keywords(), $this->keywords(), $this->keywords());

        $this->check()->assertJsonPath('keywords.matched', 2);

        // Editing the CV and checking again is free: same keywords, new score.
        $this->application->update(['tailored_cv' => 'PHP, K8s and GraphQL.']);
        $this->check()->assertJsonPath('keywords.matched', 3);
        $gemini->assertCallCount('generateJson', 1);

        $this->application->update(['job_description' => 'Run our Go services.']);
        $this->check()->assertOk();
        $gemini->assertCallCount('generateJson', 2);

        $this->application->update(['role' => 'Staff Engineer']);
        $this->check()->assertOk();
        $gemini->assertCallCount('generateJson', 3);
    }

    public function test_it_cleans_up_what_the_model_returns(): void
    {
        FakeGeminiService::swap()->queueJson(['keywords' => [
            ['term' => '  PHP  ', 'aliases' => ['php', 'PHP 8', '', 42, 'php 8', ['nested']], 'kind' => 'language', 'required' => 'yes'],
            ['term' => 'php', 'aliases' => [], 'kind' => 'skill', 'required' => true],
            ['term' => '', 'kind' => 'skill', 'required' => true],
            'not an object',
            ['term' => str_repeat('x', 61), 'kind' => 'skill', 'required' => true],
            ['term' => 'Teamwork', 'kind' => 'soft_skill', 'required' => false],
            ['term' => 'AWS', 'aliases' => 'Amazon Web Services', 'kind' => 'qualification', 'required' => true],
        ]]);

        $this->check()->assertOk();

        $this->assertSame([
            ['term' => 'PHP', 'aliases' => ['PHP 8'], 'kind' => 'skill', 'required' => false],
            ['term' => 'Teamwork', 'aliases' => [], 'kind' => 'soft_skill', 'required' => false],
            ['term' => 'AWS', 'aliases' => [], 'kind' => 'qualification', 'required' => true],
        ], $this->application->fresh()->ats_keywords['keywords']);
    }

    public function test_it_keeps_at_most_forty_keywords(): void
    {
        $many = array_map(
            fn (int $i) => ['term' => "Skill {$i}", 'aliases' => [], 'kind' => 'skill', 'required' => true],
            range(1, 50),
        );
        FakeGeminiService::swap()->queueJson(['keywords' => $many]);

        $this->check()->assertOk()->assertJsonPath('keywords.total', 40);
    }

    public function test_a_posting_with_no_keywords_is_refused_and_not_cached(): void
    {
        FakeGeminiService::swap()->queueJson(['keywords' => []], ['keywords' => 'nonsense']);

        $this->check()->assertUnprocessable()->assertJsonValidationErrors(['jobDescription']);
        $this->check()->assertUnprocessable()->assertJsonValidationErrors(['jobDescription']);

        $this->assertNull($this->application->fresh()->ats_keywords);
        $this->assertNull($this->application->fresh()->ats_report);
    }

    public function test_it_needs_a_job_description(): void
    {
        $this->application->update(['job_description' => null]);
        $gemini = FakeGeminiService::swap();

        $this->check()->assertUnprocessable()->assertJsonValidationErrors(['jobDescription']);

        $gemini->assertNothingSent();
    }

    public function test_it_needs_a_cv_to_score(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->application->update(['tailored_cv' => null]);
        $this->user->profile->update(['base_cv' => '  ']);
        $this->check()->assertUnprocessable()->assertJsonValidationErrors(['cv']);

        // Asking for the tailored CV when there is none does not quietly
        // score something else.
        $this->user->profile->update(['base_cv' => 'Ten years of PHP.']);
        $this->check(['source' => 'tailored'])->assertUnprocessable()->assertJsonValidationErrors(['cv']);

        $gemini->assertNothingSent();
    }

    public function test_a_user_without_a_profile_row_gets_a_validation_error(): void
    {
        $this->application->update(['tailored_cv' => null]);
        $this->user->profile->delete();
        $this->forgetProfile();
        $gemini = FakeGeminiService::swap();

        $this->check()->assertUnprocessable()->assertJsonValidationErrors(['cv']);

        $gemini->assertNothingSent();
    }

    public function test_the_source_must_be_tailored_or_base(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->check(['source' => 'draft'])->assertUnprocessable()->assertJsonValidationErrors(['source']);

        $gemini->assertNothingSent();
    }

    public function test_another_users_application_is_not_found(): void
    {
        $theirs = Application::factory()->create(['tailored_cv' => 'PHP']);
        $gemini = FakeGeminiService::swap();

        $this->postJson("/api/ai/applications/{$theirs->id}/ats")->assertNotFound();

        $gemini->assertNothingSent();
        $this->assertNull($theirs->fresh()->ats_report);
    }

    public function test_a_model_failure_is_a_502_and_nothing_is_saved(): void
    {
        FakeGeminiService::swap()->throwOn('generateJson');

        $this->check()
            ->assertStatus(502)
            ->assertExactJson([
                'message' => 'The AI service is unavailable right now. Please try again in a moment.',
                'code' => 'ai_unavailable',
            ]);

        $this->assertNull($this->application->fresh()->ats_keywords);
        $this->assertNull($this->application->fresh()->ats_report);
    }

    public function test_the_report_rides_along_on_the_application_and_goes_stale(): void
    {
        FakeGeminiService::swap()->queueJson($this->keywords());

        $this->getJson("/api/applications/{$this->application->id}")->assertJsonPath('data.atsReport', null);

        $score = $this->check()->json('score');

        $this->getJson('/api/applications')
            ->assertJsonPath('data.0.atsReport.score', $score)
            ->assertJsonPath('data.0.atsReport.source', 'tailored')
            ->assertJsonPath('data.0.atsReport.stale', false)
            ->assertJsonMissingPath('data.0.atsReport.cvHash');

        // A new tailored CV means the stored score no longer describes it.
        $this->patchJson("/api/applications/{$this->application->id}", ['tailoredCV' => 'Something else'])
            ->assertJsonPath('data.atsReport.score', $score)
            ->assertJsonPath('data.atsReport.stale', true);
    }

    public function test_a_new_job_description_makes_the_report_stale(): void
    {
        FakeGeminiService::swap()->queueJson($this->keywords());
        $this->check()->assertOk();

        $this->patchJson("/api/applications/{$this->application->id}", ['jobDescription' => 'A different job.'])
            ->assertJsonPath('data.atsReport.stale', true);
    }

    public function test_a_new_base_cv_makes_a_base_report_stale(): void
    {
        FakeGeminiService::swap()->queueJson($this->keywords());
        $this->check(['source' => 'base'])->assertOk();

        $this->getJson("/api/applications/{$this->application->id}")->assertJsonPath('data.atsReport.stale', false);

        $this->putJson('/api/profile', ['baseCV' => 'A rewritten base CV.'])->assertOk();
        $this->forgetProfile();

        $this->getJson("/api/applications/{$this->application->id}")->assertJsonPath('data.atsReport.stale', true);
    }

    public function test_a_client_cannot_write_the_report(): void
    {
        $this->patchJson("/api/applications/{$this->application->id}", [
            'atsReport' => ['score' => 100],
            'ats_report' => ['score' => 100],
            'ats_keywords' => ['hash' => 'x', 'keywords' => []],
        ])->assertOk()->assertJsonPath('data.atsReport', null);

        $this->assertNull($this->application->fresh()->ats_report);
        $this->assertNull($this->application->fresh()->ats_keywords);
    }

    /**
     * Sanctum::actingAs() hands every request the same User instance, so a
     * profile loaded by one request is still cached on it in the next. A real
     * request authenticates a fresh User and reads the profile anew.
     */
    private function forgetProfile(): void
    {
        $this->user->unsetRelation('profile');
    }

    /** @param  array<string, mixed>  $payload */
    private function check(array $payload = []): TestResponse
    {
        return $this->postJson("/api/ai/applications/{$this->application->id}/ats", $payload);
    }

    /** @return array<string, mixed> */
    private function keywords(): array
    {
        return ['keywords' => [
            ['term' => 'PHP', 'aliases' => [], 'kind' => 'skill', 'required' => true],
            ['term' => 'Kubernetes', 'aliases' => ['K8s'], 'kind' => 'skill', 'required' => true],
            ['term' => 'GraphQL', 'aliases' => [], 'kind' => 'skill', 'required' => false],
        ]];
    }
}
