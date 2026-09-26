<?php

namespace Tests\Feature;

use App\Services\Ai\UsageRecorder;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use App\Services\GeminiService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class GeminiServiceTest extends TestCase
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    private const TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.gemini', [
            'key' => 'test-api-key',
            'model' => 'gemini-2.0-flash',
            'tts_model' => 'gemini-2.5-flash-preview-tts',
            'live_model' => 'gemini-3.8-live',
            'base_url' => 'https://generativelanguage.googleapis.com/v1beta',
            'timeout' => 60,
            'connect_timeout' => 10,
            'retries' => 3,
            'retry_delay' => 500,
        ]);

        // No test may ever touch the network, and retries must not really sleep.
        Http::preventStrayRequests();
        Sleep::fake();

        // Capture usage in memory: these are transport tests, with no database.
        $this->usage = new class implements UsageRecorder
        {
            /** @var list<array{0: string, 1: array<string, mixed>}> */
            public array $recorded = [];

            public function record(string $model, array $usageMetadata, ?string $feature = null, string $source = 'server'): void
            {
                $this->recorded[] = [$model, $usageMetadata];
            }
        };
        $this->app->instance(UsageRecorder::class, $this->usage);
    }

    private UsageRecorder $usage;

    private function gemini(): GeminiService
    {
        return $this->app->make(GeminiService::class);
    }

    /** The JSON body of the nth (default: first) outgoing request. */
    private function payload(int $index = 0): array
    {
        $requests = Http::recorded()->map(fn (array $pair): Request => $pair[0])->values();

        $this->assertGreaterThan($index, $requests->count(), "No request was recorded at index {$index}.");

        return $requests[$index]->data();
    }

    private function textReply(string $text, string $finishReason = 'STOP'): array
    {
        return [
            'candidates' => [[
                'content' => ['role' => 'model', 'parts' => [['text' => $text]]],
                'finishReason' => $finishReason,
            ]],
        ];
    }

    private function audioReply(string $base64): array
    {
        return [
            'candidates' => [[
                'content' => [
                    'role' => 'model',
                    'parts' => [[
                        'inlineData' => ['mimeType' => 'audio/L16;rate=24000', 'data' => $base64],
                    ]],
                ],
                'finishReason' => 'STOP',
            ]],
        ];
    }

    public function test_the_container_resolves_the_service_behind_the_interface(): void
    {
        $this->assertInstanceOf(GeminiService::class, $this->app->make(GeminiClient::class));
        $this->assertSame($this->app->make(GeminiClient::class), $this->app->make(GeminiClient::class));
    }

    public function test_generate_text_posts_one_user_turn_with_the_key_in_a_header(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->textReply('Tell me about a time…'))]);

        $reply = $this->gemini()->generateText(
            'Give me a realistic behavioral interview question for the theme: "Conflict".',
        );

        $this->assertSame('Tell me about a time…', $reply);

        $payload = $this->payload();

        $this->assertSame([
            [
                'role' => 'user',
                'parts' => [[
                    'text' => 'Give me a realistic behavioral interview question for the theme: "Conflict".',
                ]],
            ],
        ], $payload['contents']);

        $this->assertArrayNotHasKey('systemInstruction', $payload);
        $this->assertArrayNotHasKey('generationConfig', $payload);

        Http::assertSent(function (Request $request) {
            return $request->url() === self::ENDPOINT
                && $request->method() === 'POST'
                && $request->hasHeader('x-goog-api-key', 'test-api-key')
                // The key must never ride along in the query string, where it
                // would end up in access logs.
                && ! str_contains($request->url(), 'test-api-key');
        });
    }

    public function test_generate_json_sends_the_response_schema_and_decodes_the_reply(): void
    {
        $problem = [
            'title' => 'Two Sum',
            'description' => 'Return indices of the two numbers adding up to target.',
            'examples' => ['nums = [2,7,11,15], target = 9 -> [0,1]'],
            'topics' => ['Arrays', 'Hash Maps'],
        ];

        Http::fake([self::ENDPOINT => Http::response($this->textReply(json_encode($problem)))]);

        // The schema is the one ported verbatim from generateCodingProblem().
        $schema = [
            'type' => 'OBJECT',
            'properties' => [
                'title' => ['type' => 'STRING'],
                'description' => ['type' => 'STRING'],
                'examples' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'topics' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
            ],
            'required' => ['title', 'description', 'examples', 'topics'],
        ];

        $decoded = $this->gemini()->generateJson(
            'Generate a programming problem for interview practice.',
            $schema,
            'You are a world-class technical interviewer.',
        );

        $this->assertSame($problem, $decoded);

        $payload = $this->payload();

        $this->assertSame('application/json', $payload['generationConfig']['responseMimeType']);
        $this->assertSame($schema, $payload['generationConfig']['responseSchema']);
        $this->assertSame(
            ['parts' => [['text' => 'You are a world-class technical interviewer.']]],
            $payload['systemInstruction'],
        );
        $this->assertSame(
            'Generate a programming problem for interview practice.',
            $payload['contents'][0]['parts'][0]['text'],
        );
    }

    public function test_generate_json_unwraps_a_fenced_json_reply(): void
    {
        Http::fake([
            self::ENDPOINT => Http::response($this->textReply("```json\n{\"company\":\"Acme\",\"role\":\"SWE\"}\n```")),
        ]);

        $this->assertSame(
            ['company' => 'Acme', 'role' => 'SWE'],
            $this->gemini()->generateJson('Parse this application log.', ['type' => 'OBJECT']),
        );
    }

    public function test_generate_json_throws_when_the_model_does_not_return_json(): void
    {
        Http::fake([
            self::ENDPOINT => Http::response($this->textReply('I am sorry, I cannot help with that request.')),
        ]);

        try {
            $this->gemini()->generateJson('Parse this application log.', ['type' => 'OBJECT']);
            $this->fail('Expected a GeminiException for a non-JSON reply.');
        } catch (GeminiException $exception) {
            $this->assertStringContainsString('could not be decoded as JSON', $exception->getMessage());
            // The raw reply is kept for logging only.
            $this->assertSame('I am sorry, I cannot help with that request.', $exception->detail());
            $this->assertStringNotContainsString('I am sorry', $exception->getMessage());
        }

        Http::assertSentCount(1);
    }

    public function test_chat_maps_a_multi_turn_history_to_alternating_contents(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->textReply('What is the time complexity?'))]);

        $reply = $this->gemini()->chat(
            [
                ['role' => 'user', 'content' => 'I think I should use a hash map.'],
                ['role' => 'model', 'content' => 'Good instinct. What does that buy you?'],
                ['role' => 'user', 'content' => 'Constant-time lookups.'],
            ],
            'You are a world-class technical interviewer and mentor.',
        );

        $this->assertSame('What is the time complexity?', $reply);

        $payload = $this->payload();

        $this->assertSame([
            ['role' => 'user', 'parts' => [['text' => 'I think I should use a hash map.']]],
            ['role' => 'model', 'parts' => [['text' => 'Good instinct. What does that buy you?']]],
            ['role' => 'user', 'parts' => [['text' => 'Constant-time lookups.']]],
        ], $payload['contents']);

        // systemInstruction is a Content object at the top level of the body,
        // not a bare string inside `config` as in the Node SDK.
        $this->assertSame(
            ['parts' => [['text' => 'You are a world-class technical interviewer and mentor.']]],
            $payload['systemInstruction'],
        );
    }

    public function test_chat_rejects_an_unsupported_role_before_sending(): void
    {
        Http::fake();

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage("Chat message #1 has an unsupported role; expected 'user' or 'model'.");

        try {
            $this->gemini()->chat([
                ['role' => 'user', 'content' => 'Hello'],
                ['role' => 'assistant', 'content' => 'Hi'],
                ['role' => 'user', 'content' => 'Again'],
            ]);
        } finally {
            Http::assertNothingSent();
        }
    }

    public function test_chat_requires_the_history_to_end_with_a_user_turn(): void
    {
        Http::fake();

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage('The last chat message must be a user turn');

        $this->gemini()->chat([
            ['role' => 'user', 'content' => 'Hello'],
            ['role' => 'model', 'content' => 'Hi there'],
        ]);
    }

    public function test_text_to_speech_uses_the_tts_model_and_returns_base64_audio(): void
    {
        Http::fake([self::TTS_ENDPOINT => Http::response($this->audioReply('QUJDREVG'))]);

        $audio = $this->gemini()->textToSpeech('Tell me about a time you handled conflict.');

        $this->assertSame('QUJDREVG', $audio);

        $payload = $this->payload();

        $this->assertSame(
            'Read this interview question clearly and professionally: Tell me about a time you handled conflict.',
            $payload['contents'][0]['parts'][0]['text'],
        );
        $this->assertSame(['AUDIO'], $payload['generationConfig']['responseModalities']);
        $this->assertSame(
            ['voiceConfig' => ['prebuiltVoiceConfig' => ['voiceName' => 'Kore']]],
            $payload['generationConfig']['speechConfig'],
        );

        Http::assertSent(fn (Request $request) => $request->url() === self::TTS_ENDPOINT);
    }

    public function test_inline_audio_parts_are_forwarded_for_the_interview_flows(): void
    {
        Http::fake([
            self::ENDPOINT => Http::response($this->textReply(json_encode([
                'transcript' => 'I led the migration.',
                'nextPrompt' => 'What was the measurable result?',
            ]))),
        ]);

        $result = $this->gemini()->generateJsonFromParts(
            [
                ['inlineData' => ['mimeType' => 'audio/webm', 'data' => 'BASE64AUDIO']],
                'You are a Senior Recruiter conducting a behavioral interview.',
            ],
            [
                'type' => 'OBJECT',
                'properties' => [
                    'transcript' => ['type' => 'STRING'],
                    'nextPrompt' => ['type' => 'STRING'],
                ],
                'required' => ['transcript', 'nextPrompt'],
            ],
        );

        $this->assertSame('What was the measurable result?', $result['nextPrompt']);

        $this->assertSame([
            ['inlineData' => ['mimeType' => 'audio/webm', 'data' => 'BASE64AUDIO']],
            ['text' => 'You are a Senior Recruiter conducting a behavioral interview.'],
        ], $this->payload()['contents'][0]['parts']);
    }

    public function test_a_server_error_is_retried_and_can_succeed(): void
    {
        Http::fake([
            self::ENDPOINT => Http::sequence()
                ->push(['error' => ['message' => 'backend overloaded']], 503)
                ->push($this->textReply('Recovered.')),
        ]);

        $this->assertSame('Recovered.', $this->gemini()->generateText('ping'));

        Http::assertSentCount(2);
    }

    public function test_retries_are_exhausted_and_then_reported(): void
    {
        Http::fake([self::ENDPOINT => Http::response(['error' => ['message' => 'boom']], 500)]);

        try {
            $this->gemini()->generateText('ping');
            $this->fail('Expected a GeminiException after the retries ran out.');
        } catch (GeminiException $exception) {
            $this->assertSame(500, $exception->status());
        }

        // config('services.gemini.retries') === 3 -> three attempts total.
        Http::assertSentCount(3);
    }

    public function test_a_client_error_is_not_retried(): void
    {
        Http::fake([
            self::ENDPOINT => Http::response(['error' => ['message' => 'API key not valid']], 400),
        ]);

        try {
            $this->gemini()->generateText('ping');
            $this->fail('Expected a GeminiException for the 400 response.');
        } catch (GeminiException $exception) {
            $this->assertSame(400, $exception->status());
            $this->assertSame('gemini-2.0-flash', $exception->model());
        }

        Http::assertSentCount(1);
    }

    public function test_a_rate_limited_response_is_retried(): void
    {
        Http::fake([
            self::ENDPOINT => Http::sequence()
                ->push(['error' => ['message' => 'quota exceeded']], 429)
                ->push($this->textReply('Back under the limit.')),
        ]);

        $this->assertSame('Back under the limit.', $this->gemini()->generateText('ping'));

        Http::assertSentCount(2);
    }

    public function test_the_exception_message_never_carries_the_upstream_body(): void
    {
        $body = [
            'error' => [
                'code' => 500,
                'message' => 'Internal error. Support id 0xdeadbeef. project=mission-employed-42',
                'status' => 'INTERNAL',
            ],
        ];

        Http::fake([self::ENDPOINT => Http::response($body, 500)]);

        try {
            $this->gemini()->generateText('ping');
            $this->fail('Expected a GeminiException.');
        } catch (GeminiException $exception) {
            $secrets = ['0xdeadbeef', 'mission-employed-42', 'Internal error', 'INTERNAL'];

            foreach ($secrets as $secret) {
                $this->assertStringNotContainsString($secret, $exception->getMessage());
                // getPrevious() would otherwise resurface the body through
                // RequestException::getMessage() in a debug-mode render.
                $this->assertStringNotContainsString($secret, (string) $exception);
            }

            $this->assertNull($exception->getPrevious());
            $this->assertSame(
                'Gemini request failed with HTTP 500 for model "gemini-2.0-flash".',
                $exception->getMessage(),
            );

            // …but the body is still available for the log line.
            $this->assertStringContainsString('0xdeadbeef', (string) $exception->detail());
            $this->assertSame(
                ['model' => 'gemini-2.0-flash', 'status' => 500, 'detail' => json_encode($body)],
                $exception->context(),
            );
        }
    }

    public function test_a_missing_api_key_fails_before_anything_is_sent(): void
    {
        config()->set('services.gemini.key', null);

        Http::fake();

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage('services.gemini.key is empty');

        try {
            $this->gemini()->generateText('ping');
        } finally {
            Http::assertNothingSent();
        }
    }

    public function test_a_blocked_prompt_is_reported_without_pretending_to_have_text(): void
    {
        Http::fake([
            self::ENDPOINT => Http::response(['promptFeedback' => ['blockReason' => 'SAFETY']]),
        ]);

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage('reason: SAFETY');

        $this->gemini()->generateText('ping');
    }

    public function test_an_empty_candidate_list_is_an_error_not_an_empty_string(): void
    {
        Http::fake([self::ENDPOINT => Http::response(['candidates' => []])]);

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage('returned no usable content');

        $this->gemini()->generateText('ping');
    }

    public function test_an_explicit_model_argument_overrides_the_configured_default(): void
    {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

        Http::fake([$url => Http::response($this->textReply('ok'))]);

        $this->assertSame('ok', $this->gemini()->generateText('ping', null, 'gemini-2.5-pro'));

        Http::assertSent(fn (Request $request) => $request->url() === $url);
    }

    private const TOKEN_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';

    public function test_a_live_token_locks_the_whole_session_setup_server_side(): void
    {
        Carbon::setTestNow('2026-09-26T10:00:00Z');

        Http::fake([self::TOKEN_ENDPOINT => Http::response(['name' => 'auth_tokens/abc123'])]);

        $token = $this->gemini()->createLiveToken('You are a Senior Recruiter.');

        $this->assertSame(['token' => 'auth_tokens/abc123', 'model' => 'models/gemini-3.8-live'], $token);

        Http::assertSent(fn (Request $request) => $request->url() === self::TOKEN_ENDPOINT
            && $request->hasHeader('x-goog-api-key', 'test-api-key'));

        $payload = $this->payload();

        // One connection, opened within a minute, usable for an hour of interview.
        $this->assertSame(1, $payload['uses']);
        $this->assertSame('2026-09-26T10:01:00.000000Z', $payload['newSessionExpireTime']);
        $this->assertSame('2026-09-26T11:00:00.000000Z', $payload['expireTime']);

        // No fieldMask: the whole setup comes from here and whatever the browser
        // sends in its own setup message is ignored, so it cannot swap the
        // interviewer's instructions or the model.
        $this->assertArrayNotHasKey('fieldMask', $payload);

        $setup = $payload['bidiGenerateContentSetup'];
        $this->assertSame('models/gemini-3.8-live', $setup['model']);
        $this->assertSame([['text' => 'You are a Senior Recruiter.']], $setup['systemInstruction']['parts']);
        $this->assertSame(['AUDIO'], $setup['generationConfig']['responseModalities']);
        $this->assertSame(
            ['voiceConfig' => ['prebuiltVoiceConfig' => ['voiceName' => 'Kore']]],
            $setup['generationConfig']['speechConfig'],
        );
        // Push-to-talk: the client marks where each answer starts and ends.
        $this->assertTrue($setup['realtimeInputConfig']['automaticActivityDetection']['disabled']);
        $this->assertTrue($setup['historyConfig']['initialHistoryInClientContent']);
        $this->assertArrayHasKey('inputAudioTranscription', $setup);
        $this->assertArrayHasKey('outputAudioTranscription', $setup);
        $this->assertArrayHasKey('slidingWindow', $setup['contextWindowCompression']);
    }

    public function test_the_live_model_comes_from_config(): void
    {
        config()->set('services.gemini.live_model', 'gemini-3.8-live-extended-thinking');

        Http::fake([self::TOKEN_ENDPOINT => Http::response(['name' => 'auth_tokens/abc123'])]);

        $token = $this->gemini()->createLiveToken('Interview.');

        $this->assertSame('models/gemini-3.8-live-extended-thinking', $token['model']);
        $this->assertSame('models/gemini-3.8-live-extended-thinking', $this->payload()['bidiGenerateContentSetup']['model']);
    }

    public function test_a_token_reply_without_a_name_is_an_error(): void
    {
        Http::fake([self::TOKEN_ENDPOINT => Http::response(['expireTime' => '2026-09-26T11:00:00Z'])]);

        $this->expectException(GeminiException::class);
        $this->expectExceptionMessage('returned no usable content');

        $this->gemini()->createLiveToken('Interview.');
    }

    public function test_a_rejected_token_request_does_not_leak_the_upstream_body(): void
    {
        Http::fake([self::TOKEN_ENDPOINT => Http::response(['error' => ['message' => 'secret upstream detail']], 400)]);

        try {
            $this->gemini()->createLiveToken('Interview.');
            $this->fail('Expected a GeminiException.');
        } catch (GeminiException $exception) {
            $this->assertStringNotContainsString('secret upstream detail', $exception->getMessage());
        }
    }

    public function test_each_replys_usage_metadata_goes_to_the_recorder(): void
    {
        $metadata = ['promptTokenCount' => 12, 'candidatesTokenCount' => 3, 'totalTokenCount' => 15];

        Http::fake([self::ENDPOINT => Http::sequence()
            ->push($this->textReply('one') + ['usageMetadata' => $metadata])
            ->push($this->textReply('two'))]);

        $this->gemini()->generateText('ping');
        $this->gemini()->generateText('ping again');

        // The second reply carried no usage, so nothing was reported for it.
        $this->assertSame([['gemini-2.0-flash', $metadata]], $this->usage->recorded);
    }
}
