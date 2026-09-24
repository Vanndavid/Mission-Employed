<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_endpoint_reports_ok(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson([
                'status' => 'ok',
                'checks' => ['database' => 'ok', 'storage' => 'ok'],
            ]);
    }

    /**
     * The uptime monitor and deploy.sh both read a non-2xx as "down", so a
     * broken database has to fail the check rather than hide behind a 200.
     */
    public function test_health_is_503_when_the_database_is_unreachable(): void
    {
        config(['database.connections.sqlite.database' => '/nonexistent/dir/db.sqlite']);
        DB::purge('sqlite');

        $this->getJson('/api/health')
            ->assertStatus(503)
            ->assertJsonPath('status', 'failing')
            ->assertJsonPath('checks.database', 'failing')
            ->assertJsonPath('checks.storage', 'ok');
    }

    public function test_health_is_503_when_storage_is_not_writable(): void
    {
        Storage::shouldReceive('disk->put')->andThrow(new \RuntimeException('read-only'));

        $this->getJson('/api/health')
            ->assertStatus(503)
            ->assertJsonPath('checks.storage', 'failing');
    }

    /** It is unauthenticated, so the reason a check failed stays in the log. */
    public function test_health_does_not_leak_the_underlying_error(): void
    {
        config(['database.connections.sqlite.database' => '/nonexistent/dir/db.sqlite']);
        DB::purge('sqlite');

        $body = $this->getJson('/api/health')->getContent();

        $this->assertStringNotContainsString('nonexistent', $body);
    }

    public function test_api_routes_are_registered_under_the_api_prefix(): void
    {
        $this->get('/health')->assertNotFound();
    }

    public function test_protected_api_routes_reject_requests_without_a_bearer_token(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    /**
     * The client always sends `Accept: application/json`, but a browser address
     * bar, a crawler or a bare curl does not. Those took Laravel's HTML branch,
     * where the `auth` middleware redirects a guest to a route named `login` --
     * which an API-only app does not have -- so the response was a 500 instead
     * of a 401. Deployed and reproduced against the live site before the fix.
     */
    public function test_protected_api_routes_reject_a_request_that_did_not_ask_for_json(): void
    {
        $this->get('/api/auth/me')->assertUnauthorized();
    }

    public function test_a_missing_api_route_is_json_not_html(): void
    {
        $this->get('/api/nope')
            ->assertNotFound()
            ->assertHeader('content-type', 'application/json');
    }
}
