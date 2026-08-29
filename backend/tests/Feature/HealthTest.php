<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_endpoint_reports_ok(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok']);
    }

    public function test_api_routes_are_registered_under_the_api_prefix(): void
    {
        $this->get('/health')->assertNotFound();
    }

    public function test_protected_api_routes_reject_requests_without_a_bearer_token(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }
}
