<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Google Generative Language REST client.
 *
 * There is no official Gemini PHP SDK, so this speaks the `:generateContent`
 * REST endpoint directly over Illuminate's HTTP client. It is a pure
 * transport: stateless, no session map (the Node version kept chats in an
 * in-memory `Map` that died with the process), no persistence.
 */
class GeminiService implements GeminiClient
{
    public const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

    public const DEFAULT_MODEL = 'gemini-2.0-flash';

    public const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

    /** Prebuilt voice used by the Node implementation. */
    public const TTS_VOICE = 'Kore';

    public const ROLE_USER = 'user';

    public const ROLE_MODEL = 'model';

    /** Statuses worth a second attempt. Everything else in 4xx is our fault. */
    private const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

    public function generateText(string $prompt, ?string $systemInstruction = null, ?string $model = null): string
    {
        return $this->generateTextFromParts([$prompt], $systemInstruction, $model);
    }

    public function generateTextFromParts(array $parts, ?string $systemInstruction = null, ?string $model = null): string
    {
        $model = $this->resolveModel($model);

        $payload = $this->basePayload($parts, $systemInstruction);

        return $this->extractText($this->send($model, $payload), $model);
    }

    public function generateJson(string $prompt, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array
    {
        return $this->generateJsonFromParts([$prompt], $responseSchema, $systemInstruction, $model);
    }

    public function generateJsonFromParts(array $parts, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array
    {
        if ($responseSchema === []) {
            throw GeminiException::invalidRequest('A response schema is required for structured Gemini calls.');
        }

        $model = $this->resolveModel($model);

        $payload = $this->basePayload($parts, $systemInstruction);
        $payload['generationConfig'] = [
            'responseMimeType' => 'application/json',
            'responseSchema' => $responseSchema,
        ];

        $text = $this->extractText($this->send($model, $payload), $model);

        return $this->decodeJson($text, $model);
    }

    public function chat(array $messages, ?string $systemInstruction = null, ?string $model = null): string
    {
        $model = $this->resolveModel($model);

        $payload = [
            'contents' => $this->mapHistory($messages),
        ];

        if ($instruction = $this->instructionBlock($systemInstruction)) {
            $payload['systemInstruction'] = $instruction;
        }

        return $this->extractText($this->send($model, $payload), $model);
    }

    public function textToSpeech(string $text): string
    {
        $model = $this->ttsModel();

        $payload = [
            'contents' => [[
                'role' => self::ROLE_USER,
                'parts' => [[
                    'text' => 'Read this interview question clearly and professionally: '.$text,
                ]],
            ]],
            'generationConfig' => [
                'responseModalities' => ['AUDIO'],
                'speechConfig' => [
                    'voiceConfig' => [
                        'prebuiltVoiceConfig' => ['voiceName' => self::TTS_VOICE],
                    ],
                ],
            ],
        ];

        return $this->extractAudio($this->send($model, $payload), $model);
    }

    /*
    |--------------------------------------------------------------------------
    | Payload building
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<int, string|array<string, mixed>>  $parts
     * @return array<string, mixed>
     */
    private function basePayload(array $parts, ?string $systemInstruction): array
    {
        $payload = [
            'contents' => [[
                'role' => self::ROLE_USER,
                'parts' => $this->normaliseParts($parts),
            ]],
        ];

        if ($instruction = $this->instructionBlock($systemInstruction)) {
            $payload['systemInstruction'] = $instruction;
        }

        return $payload;
    }

    /**
     * The REST field is `systemInstruction`, a Content object — not a plain
     * string as in the Node SDK's `config.systemInstruction`.
     *
     * @return array<string, mixed>|null
     */
    private function instructionBlock(?string $systemInstruction): ?array
    {
        $systemInstruction = $systemInstruction === null ? null : trim($systemInstruction);

        if ($systemInstruction === null || $systemInstruction === '') {
            return null;
        }

        return ['parts' => [['text' => $systemInstruction]]];
    }

    /**
     * @param  array<int, string|array<string, mixed>>  $parts
     * @return array<int, array<string, mixed>>
     */
    private function normaliseParts(array $parts): array
    {
        if ($parts === []) {
            throw GeminiException::invalidRequest('A Gemini request needs at least one content part.');
        }

        $normalised = [];

        foreach ($parts as $part) {
            if (is_string($part)) {
                if (trim($part) === '') {
                    throw GeminiException::invalidRequest('A Gemini text part cannot be empty.');
                }

                $normalised[] = ['text' => $part];

                continue;
            }

            if (! is_array($part)) {
                throw GeminiException::invalidRequest('A Gemini content part must be a string or an array.');
            }

            if (isset($part['text'])) {
                if (! is_string($part['text'])) {
                    throw GeminiException::invalidRequest('A Gemini text part must be a string.');
                }

                $normalised[] = ['text' => $part['text']];

                continue;
            }

            $inline = $part['inlineData'] ?? $part['inline_data'] ?? null;

            if (is_array($inline)) {
                $mimeType = $inline['mimeType'] ?? $inline['mime_type'] ?? null;
                $data = $inline['data'] ?? null;

                if (! is_string($mimeType) || $mimeType === '' || ! is_string($data) || $data === '') {
                    throw GeminiException::invalidRequest('An inline Gemini part needs a mimeType and base64 data.');
                }

                $normalised[] = ['inlineData' => ['mimeType' => $mimeType, 'data' => $data]];

                continue;
            }

            throw GeminiException::invalidRequest('Unsupported Gemini content part; expected text or inlineData.');
        }

        return $normalised;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     * @return array<int, array<string, mixed>>
     */
    private function mapHistory(array $messages): array
    {
        if ($messages === []) {
            throw GeminiException::invalidRequest('A Gemini chat needs at least one message.');
        }

        $contents = [];

        foreach (array_values($messages) as $index => $message) {
            if (! is_array($message) || ! isset($message['role'], $message['content'])) {
                throw GeminiException::invalidRequest(
                    "Chat message #{$index} must have a 'role' and 'content'."
                );
            }

            $role = $message['role'];

            if (! in_array($role, [self::ROLE_USER, self::ROLE_MODEL], true)) {
                throw GeminiException::invalidRequest(
                    "Chat message #{$index} has an unsupported role; expected 'user' or 'model'."
                );
            }

            if (! is_string($message['content']) || trim($message['content']) === '') {
                throw GeminiException::invalidRequest("Chat message #{$index} has empty content.");
            }

            $contents[] = [
                'role' => $role,
                'parts' => [['text' => $message['content']]],
            ];
        }

        if (end($contents)['role'] !== self::ROLE_USER) {
            throw GeminiException::invalidRequest(
                'The last chat message must be a user turn for Gemini to reply to.'
            );
        }

        return $contents;
    }

    /*
    |--------------------------------------------------------------------------
    | Transport
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<string, mixed>  $payload
     * @return array<array-key, mixed>
     */
    private function send(string $model, array $payload): array
    {
        $key = $this->apiKey();

        if ($key === null) {
            throw GeminiException::missingApiKey();
        }

        $url = rtrim($this->baseUrl(), '/')."/models/{$model}:generateContent";

        try {
            $response = Http::withHeaders([
                'x-goog-api-key' => $key,
                'Accept' => 'application/json',
            ])
                ->asJson()
                ->timeout($this->config('timeout', 60))
                ->connectTimeout($this->config('connect_timeout', 10))
                ->retry(
                    max(1, (int) $this->config('retries', 3)),
                    max(0, (int) $this->config('retry_delay', 500)),
                    fn (Throwable $exception) => $this->shouldRetry($exception),
                    throw: false,
                )
                ->post($url, $payload);
        } catch (ConnectionException $exception) {
            throw GeminiException::transportFailure($model, $exception->getMessage());
        }

        if ($response->failed()) {
            throw GeminiException::fromStatus($response->status(), $model, $response->body());
        }

        return $this->decodeEnvelope($response, $model);
    }

    /**
     * Transient failures only. A 4xx (other than 408/429) means a bad key, a
     * bad model name or a bad payload — retrying just burns quota.
     */
    private function shouldRetry(Throwable $exception): bool
    {
        if ($exception instanceof ConnectionException) {
            return true;
        }

        if ($exception instanceof RequestException && $exception->response !== null) {
            return in_array($exception->response->status(), self::RETRYABLE_STATUSES, true);
        }

        return false;
    }

    /**
     * @return array<array-key, mixed>
     */
    private function decodeEnvelope(Response $response, string $model): array
    {
        $data = $response->json();

        if (! is_array($data)) {
            throw GeminiException::emptyResponse($model, $response->body());
        }

        $blockReason = data_get($data, 'promptFeedback.blockReason');

        if (is_string($blockReason) && $blockReason !== '') {
            throw GeminiException::blocked($model, $blockReason);
        }

        return $data;
    }

    /*
    |--------------------------------------------------------------------------
    | Response extraction
    |--------------------------------------------------------------------------
    */

    /**
     * The Node SDK exposes `response.text`, which is the concatenation of every
     * text part of the first candidate. Reproduce that.
     *
     * @param  array<array-key, mixed>  $data
     */
    private function extractText(array $data, string $model): string
    {
        $parts = data_get($data, 'candidates.0.content.parts');

        $text = '';

        if (is_array($parts)) {
            foreach ($parts as $part) {
                if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                    $text .= $part['text'];
                }
            }
        }

        if (trim($text) === '') {
            throw GeminiException::emptyResponse($model, $this->finishReason($data));
        }

        return $text;
    }

    /**
     * @param  array<array-key, mixed>  $data
     */
    private function extractAudio(array $data, string $model): string
    {
        $parts = data_get($data, 'candidates.0.content.parts');

        if (is_array($parts)) {
            foreach ($parts as $part) {
                $inline = is_array($part) ? ($part['inlineData'] ?? $part['inline_data'] ?? null) : null;
                $audio = is_array($inline) ? ($inline['data'] ?? null) : null;

                if (is_string($audio) && $audio !== '') {
                    return $audio;
                }
            }
        }

        throw GeminiException::emptyResponse($model, $this->finishReason($data));
    }

    /**
     * @param  array<array-key, mixed>  $data
     */
    private function finishReason(array $data): ?string
    {
        $reason = data_get($data, 'candidates.0.finishReason');

        return is_string($reason) ? 'finishReason: '.$reason : null;
    }

    /**
     * @return array<array-key, mixed>
     */
    private function decodeJson(string $text, string $model): array
    {
        $candidate = $this->stripCodeFence(trim($text));

        $decoded = json_decode($candidate, true);

        if (! is_array($decoded)) {
            throw GeminiException::malformedJson($model, $text);
        }

        return $decoded;
    }

    /**
     * `responseMimeType: application/json` usually prevents this, but models
     * occasionally still wrap their answer in a ```json fence.
     */
    private function stripCodeFence(string $text): string
    {
        if (! str_starts_with($text, '```')) {
            return $text;
        }

        $text = preg_replace('/^```[a-zA-Z0-9_-]*\s*/', '', $text) ?? $text;

        return rtrim(preg_replace('/```\s*$/', '', $text) ?? $text);
    }

    /*
    |--------------------------------------------------------------------------
    | Configuration
    |--------------------------------------------------------------------------
    */

    private function resolveModel(?string $model): string
    {
        $model = $model !== null && trim($model) !== ''
            ? trim($model)
            : (string) $this->config('model', self::DEFAULT_MODEL);

        return $model !== '' ? $model : self::DEFAULT_MODEL;
    }

    private function ttsModel(): string
    {
        $model = (string) $this->config('tts_model', self::DEFAULT_TTS_MODEL);

        return $model !== '' ? $model : self::DEFAULT_TTS_MODEL;
    }

    private function baseUrl(): string
    {
        $url = (string) $this->config('base_url', self::DEFAULT_BASE_URL);

        return $url !== '' ? $url : self::DEFAULT_BASE_URL;
    }

    private function apiKey(): ?string
    {
        $key = $this->config('key');

        return is_string($key) && trim($key) !== '' ? trim($key) : null;
    }

    private function config(string $key, mixed $default = null): mixed
    {
        return config("services.gemini.{$key}", $default) ?? $default;
    }
}
