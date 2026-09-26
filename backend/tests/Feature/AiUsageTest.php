<?php

namespace Tests\Feature;

use App\Models\AiUsage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Sleep;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Every Gemini call made on a user's behalf leaves a row in ai_usage: who,
 * which feature, which model, how many tokens, and what that cost at the time.
 *
 * These go through a real route and the real GeminiService, faking only
 * Google's HTTP, so they prove the whole chain and not just the recorder.
 */
class AiUsageTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.gemini', [
            'key' => 'test-api-key',
            'model' => 'gemini-3.7-flash',
            'base_url' => 'https://generativelanguage.googleapis.com/v1beta',
            'retries' => 3,
            'retry_delay' => 0,
        ]);
        Sleep::fake();

        $this->user = User::factory()->premium()->create();
        Sanctum::actingAs($this->user);
    }

    /** @param  array<string, mixed>|null  $usage */
    private function parseReply(?array $usage): array
    {
        $reply = [
            'candidates' => [[
                'content' => ['role' => 'model', 'parts' => [['text' => '{"company":"Acme","role":"Engineer"}']]],
                'finishReason' => 'STOP',
            ]],
        ];

        return $usage === null ? $reply : $reply + ['usageMetadata' => $usage];
    }

    private function parseJob(): void
    {
        $this->postJson('/api/ai/job/parse', ['text' => 'Acme is hiring an Engineer.'])->assertOk();
    }

    public function test_a_gemini_call_records_the_users_tokens_and_cost(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->parseReply([
            'promptTokenCount' => 1000,
            'candidatesTokenCount' => 200,
            'thoughtsTokenCount' => 100,
            'totalTokenCount' => 1300,
        ]))]);

        $this->parseJob();

        $usage = AiUsage::sole();

        $this->assertSame($this->user->id, $usage->user_id);
        $this->assertSame('ai/job/parse', $usage->feature);
        $this->assertSame('gemini-3.7-flash', $usage->model);
        $this->assertSame('server', $usage->source);
        $this->assertSame([1000, 200, 100, 1300], [
            $usage->prompt_tokens, $usage->output_tokens, $usage->thought_tokens, $usage->total_tokens,
        ]);
        // $0.75/M in, $3.75/M out with thinking billed as output: a price per
        // million tokens is exactly micro-dollars per token.
        $this->assertSame(1000 * 0.75 + (200 + 100) * 3.75, (float) $usage->cost_micros);
    }

    public function test_a_model_with_no_known_price_keeps_its_tokens_but_no_cost(): void
    {
        config()->set('services.gemini.model', 'gemini-9-mystery');

        Http::fake(['*gemini-9-mystery:generateContent' => Http::response($this->parseReply([
            'promptTokenCount' => 10, 'candidatesTokenCount' => 5, 'totalTokenCount' => 15,
        ]))]);

        $this->parseJob();

        $usage = AiUsage::sole();
        $this->assertSame(15, $usage->total_tokens);
        // Never priced as zero: an unknown price is not a free call.
        $this->assertNull($usage->cost_micros);
    }

    public function test_a_retried_call_is_counted_once(): void
    {
        Http::fake([self::ENDPOINT => Http::sequence()
            ->push(['error' => ['message' => 'busy']], 503)
            ->push($this->parseReply(['promptTokenCount' => 10, 'candidatesTokenCount' => 5, 'totalTokenCount' => 15]))]);

        $this->parseJob();

        $this->assertSame(1, AiUsage::count());
    }

    public function test_a_reply_without_usage_records_nothing(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->parseReply(null))]);

        $this->parseJob();

        $this->assertSame(0, AiUsage::count());
    }

    public function test_a_failed_usage_write_never_fails_the_feature(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->parseReply([
            'promptTokenCount' => 10, 'candidatesTokenCount' => 5, 'totalTokenCount' => 15,
        ]))]);
        Log::spy();
        Schema::drop('ai_usage');

        $this->parseJob();

        Log::shouldHaveReceived('warning')->withArgs(fn (string $message) => str_contains($message, 'AI usage'));
    }
}
