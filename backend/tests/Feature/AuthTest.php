<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Registration, login, logout and the current user.
 *
 * These cover the behaviours the retired server/auth.js had, so a regression
 * here means the port lost something rather than merely changed shape.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_returns_a_token_and_the_user(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.email', 'nova@example.test')
            ->assertJsonPath('user.role', 'user')
            ->assertJsonPath('user.plan', 'free')
            ->assertJsonStructure(['user' => ['id', 'email', 'role', 'plan', 'createdAt'], 'token']);

        $this->assertNotEmpty($response->json('token'));
    }

    /**
     * The tracker and CV endpoints assume a profile always exists rather than
     * upserting one, so registration has to create it.
     */
    public function test_registration_creates_the_users_profile(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ])->assertCreated();

        $user = User::where('email', 'nova@example.test')->sole();

        $this->assertNotNull($user->profile, 'A registered user must have a profile row.');
    }

    public function test_registration_rejects_a_duplicate_email(): void
    {
        User::factory()->create(['email' => 'taken@example.test']);

        $this->postJson('/api/auth/register', [
            'email' => 'taken@example.test',
            'password' => 'correct-horse',
        ])->assertStatus(422)->assertJsonValidationErrorFor('email');
    }

    /**
     * server/usersStore.js lowercased and trimmed before both the duplicate
     * check and storage, so one address could not become two accounts.
     */
    public function test_registration_treats_a_differently_cased_email_as_taken(): void
    {
        User::factory()->create(['email' => 'taken@example.test']);

        $this->postJson('/api/auth/register', [
            'email' => '  TAKEN@Example.TEST  ',
            'password' => 'correct-horse',
        ])->assertStatus(422)->assertJsonValidationErrorFor('email');
    }

    public function test_registration_rejects_a_password_under_eight_characters(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'nova@example.test',
            'password' => 'seven77',
        ])->assertStatus(422)->assertJsonValidationErrorFor('password');

        $this->assertDatabaseMissing('users', ['email' => 'nova@example.test']);
    }

    public function test_login_returns_a_token(): void
    {
        User::factory()->create([
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ])->assertOk()->assertJsonPath('user.email', 'nova@example.test');
    }

    /**
     * A wrong password and an address that was never registered must be
     * indistinguishable, or the endpoint becomes an account-enumeration oracle.
     */
    public function test_a_wrong_password_and_an_unknown_email_fail_identically(): void
    {
        User::factory()->create([
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ]);

        $wrongPassword = $this->postJson('/api/auth/login', [
            'email' => 'nova@example.test',
            'password' => 'not-the-password',
        ])->assertStatus(422);

        $unknownEmail = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.test',
            'password' => 'not-the-password',
        ])->assertStatus(422);

        $this->assertSame(
            $wrongPassword->json('errors'),
            $unknownEmail->json('errors'),
            'Login must not reveal whether an email is registered.'
        );
    }

    public function test_me_requires_a_token(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_me_returns_the_authenticated_user(): void
    {
        $user = User::factory()->create(['email' => 'nova@example.test']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.email', 'nova@example.test');
    }

    /**
     * Signing out of a laptop must not sign the same account out on a phone,
     * so logout deletes the token that made the request and nothing else.
     */
    public function test_logout_revokes_only_the_token_that_was_used(): void
    {
        $user = User::factory()->create();
        $laptop = $user->createToken('laptop')->plainTextToken;
        $phone = $user->createToken('phone')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$laptop}")
            ->postJson('/api/auth/logout')
            ->assertNoContent();

        $this->assertSame(
            1,
            $user->tokens()->count(),
            'Logout must delete exactly the token it was called with.'
        );

        // The test client caches the guard's resolved user between requests, so
        // without this the revoked token would appear to still work.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$laptop}")
            ->getJson('/api/auth/me')
            ->assertUnauthorized();

        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$phone}")
            ->getJson('/api/auth/me')
            ->assertOk();
    }

    /**
     * UserResource, not $hidden, decides what a user serializes to. Assert on
     * the raw body so a hash could not hide behind a nested key.
     */
    public function test_no_auth_response_ever_carries_the_password_hash(): void
    {
        $user = User::factory()->create([
            'email' => 'nova@example.test',
            'password' => 'correct-horse',
        ]);

        $bodies = [
            $this->postJson('/api/auth/register', [
                'email' => 'other@example.test',
                'password' => 'correct-horse',
            ])->getContent(),
            $this->postJson('/api/auth/login', [
                'email' => 'nova@example.test',
                'password' => 'correct-horse',
            ])->getContent(),
            $this->actingAs($user, 'sanctum')->getJson('/api/auth/me')->getContent(),
        ];

        foreach ($bodies as $body) {
            $this->assertStringNotContainsString('password', $body);
            $this->assertStringNotContainsString($user->fresh()->password, $body);
        }
    }
}
