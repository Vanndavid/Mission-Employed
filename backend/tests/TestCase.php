<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // No test may open a socket. GeminiServiceTest talks to Gemini through
        // Http::fake(); everything else that touches a model binds
        // FakeGeminiService. A missed fake becomes a failure instead of a live
        // call.
        Http::preventStrayRequests();
    }
}
