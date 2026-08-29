<?php

namespace Tests\Unit;

use App\Services\FakeGeminiService;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use App\Services\GeminiService;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;

class FakeGeminiServiceTest extends TestCase
{
    public function test_swap_replaces_the_real_client_in_the_container(): void
    {
        Http::preventStrayRequests();

        $fake = FakeGeminiService::swap();

        $this->assertSame($fake, $this->app->make(GeminiClient::class));
        $this->assertSame($fake, $this->app->make(GeminiService::class));

        // Proof that nothing reaches the network.
        $this->assertSame($fake->defaultText, $this->app->make(GeminiClient::class)->generateText('hi'));
    }

    public function test_queued_responses_are_returned_in_order_then_fall_back_to_defaults(): void
    {
        $fake = (new FakeGeminiService)->queueText('first', 'second');

        $this->assertSame('first', $fake->generateText('a'));
        $this->assertSame('second', $fake->generateText('b'));
        $this->assertSame($fake->defaultText, $fake->generateText('c'));
    }

    public function test_the_from_parts_variants_share_a_queue_with_their_plain_counterparts(): void
    {
        $fake = (new FakeGeminiService)
            ->queueJson(['transcript' => 'x'], ['transcript' => 'y']);

        $this->assertSame(['transcript' => 'x'], $fake->generateJson('a', ['type' => 'OBJECT']));
        $this->assertSame(
            ['transcript' => 'y'],
            $fake->generateJsonFromParts([['inlineData' => ['mimeType' => 'audio/webm', 'data' => 'B64']], 'b'], ['type' => 'OBJECT']),
        );
    }

    public function test_it_records_what_it_was_sent(): void
    {
        $fake = (new FakeGeminiService)->queueChat('the reply');

        $fake->chat(
            [
                ['role' => 'user', 'content' => 'first question'],
                ['role' => 'model', 'content' => 'an answer'],
                ['role' => 'user', 'content' => 'follow up'],
            ],
            'You are a mentor.',
            'gemini-2.0-flash',
        );

        $fake->assertCalled('chat')
            ->assertCallCount('chat', 1)
            ->assertNotCalled('textToSpeech')
            ->assertPromptContains('follow up');

        $call = $fake->lastCall('chat');

        $this->assertSame('You are a mentor.', $call['systemInstruction']);
        $this->assertSame('gemini-2.0-flash', $call['model']);
        $this->assertCount(3, $call['messages']);
    }

    public function test_assertions_fail_loudly_when_a_call_did_not_happen(): void
    {
        $fake = new FakeGeminiService;

        $fake->assertNothingSent();

        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Expected GeminiClient::generateJson() to be called');

        $fake->assertCalled('generateJson');
    }

    public function test_it_can_be_told_to_fail(): void
    {
        $fake = (new FakeGeminiService)->throwOn('textToSpeech');

        try {
            $fake->textToSpeech('speak');
            $this->fail('Expected the queued failure to be thrown.');
        } catch (GeminiException $exception) {
            $this->assertSame(503, $exception->status());
        }

        // The failure is one-shot; the next call behaves normally.
        $this->assertSame($fake->defaultAudio, $fake->textToSpeech('speak again'));
        $fake->assertCallCount('textToSpeech', 2);
    }
}
