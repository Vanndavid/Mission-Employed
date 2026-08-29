<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_profile_requires_a_token(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
        $this->putJson('/api/profile', ['baseCV' => 'x'])->assertUnauthorized();
    }

    public function test_it_returns_the_signed_in_users_profile(): void
    {
        $user = User::factory()->create();
        Profile::factory()->for($user)->create([
            'base_cv' => 'My CV',
            'portfolio_url' => 'https://example.test/portfolio',
            'cv_file_name' => null,
        ]);
        // Someone else's profile, which must not surface here.
        Profile::factory()->create(['base_cv' => 'Not mine']);

        Sanctum::actingAs($user);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.baseCV', 'My CV')
            ->assertJsonPath('data.portfolioUrl', 'https://example.test/portfolio')
            // Null columns read back as '' — the client types them as strings.
            ->assertJsonPath('data.cvFileName', '');
    }

    public function test_it_updates_the_profile_in_place(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->for($user)->empty()->create();

        Sanctum::actingAs($user);

        $this->putJson('/api/profile', [
            'baseCV' => 'Updated CV',
            'cvFileName' => 'cv.pdf',
            'baseCoverLetter' => 'Dear team',
            'portfolioUrl' => 'https://example.test',
            'coverLetterTemplate' => 'Template',
            'cvTemplate' => 'CV template',
        ])->assertOk()->assertJsonPath('data.baseCV', 'Updated CV');

        $this->assertDatabaseCount('profiles', 1);
        $profile->refresh();
        $this->assertSame('Updated CV', $profile->base_cv);
        $this->assertSame('cv.pdf', $profile->cv_file_name);
        $this->assertSame('CV template', $profile->cv_template);
    }

    public function test_a_partial_save_leaves_the_other_fields_alone(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->for($user)->create(['base_cv' => 'Keep me']);

        Sanctum::actingAs($user);

        $this->putJson('/api/profile', ['portfolioUrl' => 'https://new.test'])->assertOk();

        $profile->refresh();
        $this->assertSame('Keep me', $profile->base_cv);
        $this->assertSame('https://new.test', $profile->portfolio_url);
    }

    public function test_it_never_touches_another_users_profile(): void
    {
        $user = User::factory()->create();
        Profile::factory()->for($user)->create();
        $theirs = Profile::factory()->create(['base_cv' => 'Theirs']);

        Sanctum::actingAs($user);

        $this->putJson('/api/profile', ['baseCV' => 'Mine now'])->assertOk();

        $this->assertSame('Theirs', $theirs->fresh()->base_cv);
    }
}
