<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Login and registration are the only routes reachable without a token, so
 * they are the ones a script can hammer. In production every request reaches
 * Laravel through Traefik and nginx, so the limits only mean anything if
 * `$request->ip()` is the visitor's address rather than nginx's.
 */
class AuthThrottleTest extends TestCase
{
    use RefreshDatabase;

    /** What Laravel sees in production: nginx on the compose network, with Traefik's address appended after the visitor's. */
    private function viaProxies(string $client): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => '172.19.0.5'])
            ->withHeader('X-Forwarded-For', "{$client}, 172.18.0.2");
    }

    private function failLogin(string $email = 'nova@example.test'): TestResponse
    {
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'wrong-password']);
    }

    public function test_login_locks_out_after_five_failed_attempts_a_minute(): void
    {
        User::factory()->create(['email' => 'nova@example.test']);

        for ($i = 0; $i < 5; $i++) {
            $this->failLogin()->assertStatus(422);
        }

        $this->failLogin()->assertStatus(429)->assertHeader('Retry-After');

        $this->travel(61)->seconds();

        $this->failLogin()->assertStatus(422);
    }

    public function test_one_account_being_hammered_does_not_lock_out_another(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->failLogin('target@example.test');
        }

        $this->failLogin('target@example.test')->assertStatus(429);
        $this->failLogin('someone-else@example.test')->assertStatus(422);
    }

    public function test_the_visitor_behind_the_proxies_is_who_gets_limited(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->viaProxies('203.0.113.7')->failLogin();
        }

        $this->viaProxies('203.0.113.7')->failLogin()->assertStatus(429);
        $this->viaProxies('198.51.100.9')->failLogin()->assertStatus(422);
    }

    public function test_a_forged_forwarded_for_header_does_not_dodge_the_limit(): void
    {
        // A visitor can put anything in their own X-Forwarded-For; Traefik and
        // nginx append the real hops after it, and only those are trusted.
        foreach (['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5', '6.6.6.6'] as $forged) {
            $this->withServerVariables(['REMOTE_ADDR' => '172.19.0.5'])
                ->withHeader('X-Forwarded-For', "{$forged}, 203.0.113.7, 172.18.0.2")
                ->failLogin();
        }

        $this->viaProxies('203.0.113.7')->failLogin()->assertStatus(429);
    }

    public function test_registration_is_limited_per_visitor(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->viaProxies('203.0.113.7')
                ->postJson('/api/auth/register', ['email' => "bot{$i}@example.test", 'password' => 'correct-horse'])
                ->assertCreated();
        }

        $this->viaProxies('203.0.113.7')
            ->postJson('/api/auth/register', ['email' => 'bot10@example.test', 'password' => 'correct-horse'])
            ->assertStatus(429);

        $this->viaProxies('198.51.100.9')
            ->postJson('/api/auth/register', ['email' => 'human@example.test', 'password' => 'correct-horse'])
            ->assertCreated();
    }
}
