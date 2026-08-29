<?php

namespace App\Services;

use PHPUnit\Framework\Assert as PHPUnit;
use Throwable;

/**
 * In-memory {@see GeminiClient} for tests. It never opens a socket.
 *
 * Bind it in place of the real client and every AI endpoint becomes
 * deterministic:
 *
 *     $gemini = FakeGeminiService::swap()
 *         ->queueJson(['title' => 'Two Sum', 'topics' => ['Arrays']]);
 *
 *     $this->postJson('/api/ai/coding/problem', ['difficulty' => 'Easy']);
 *
 *     $gemini->assertCalled('generateJson', fn ($call) =>
 *         str_contains($call['prompt'], 'Easy'));
 *
 * Queued responses are consumed FIFO; once a queue runs dry the matching
 * default is returned, so tests only queue what they actually assert on.
 */
class FakeGeminiService implements GeminiClient
{
    /** @var array<int, array<string, mixed>> */
    private array $calls = [];

    /** @var array<string, array<int, mixed>> */
    private array $queues = [];

    /** @var array<string, Throwable> */
    private array $failures = [];

    public string $defaultText = 'Fake Gemini text response.';

    /** @var array<array-key, mixed> */
    public array $defaultJson = ['ok' => true];

    /** base64 of "fake-audio" */
    public string $defaultAudio = 'ZmFrZS1hdWRpbw==';

    /**
     * Register this fake as the application's GeminiClient and return it.
     */
    public static function swap(): static
    {
        $fake = new static;

        app()->instance(GeminiClient::class, $fake);
        app()->instance(GeminiService::class, $fake);

        return $fake;
    }

    /*
    |--------------------------------------------------------------------------
    | Canned responses
    |--------------------------------------------------------------------------
    */

    public function queueText(string ...$responses): static
    {
        return $this->push('generateText', $responses);
    }

    /**
     * @param  array<array-key, mixed>  ...$responses
     */
    public function queueJson(array ...$responses): static
    {
        return $this->push('generateJson', $responses);
    }

    public function queueChat(string ...$responses): static
    {
        return $this->push('chat', $responses);
    }

    public function queueAudio(string ...$responses): static
    {
        return $this->push('textToSpeech', $responses);
    }

    /**
     * Make the next call to $method blow up. Use it to exercise error paths.
     */
    public function throwOn(string $method, ?Throwable $exception = null): static
    {
        $this->failures[$this->bucket($method)] = $exception
            ?? GeminiException::fromStatus(503, 'fake-model', 'upstream unavailable');

        return $this;
    }

    public function reset(): static
    {
        $this->calls = [];
        $this->queues = [];
        $this->failures = [];

        return $this;
    }

    /*
    |--------------------------------------------------------------------------
    | GeminiClient
    |--------------------------------------------------------------------------
    */

    public function generateText(string $prompt, ?string $systemInstruction = null, ?string $model = null): string
    {
        return $this->record('generateText', [
            'prompt' => $prompt,
            'parts' => [$prompt],
            'systemInstruction' => $systemInstruction,
            'model' => $model,
        ], fn () => $this->defaultText);
    }

    public function generateTextFromParts(array $parts, ?string $systemInstruction = null, ?string $model = null): string
    {
        return $this->record('generateTextFromParts', [
            'prompt' => $this->flatten($parts),
            'parts' => $parts,
            'systemInstruction' => $systemInstruction,
            'model' => $model,
        ], fn () => $this->defaultText);
    }

    public function generateJson(string $prompt, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array
    {
        return $this->record('generateJson', [
            'prompt' => $prompt,
            'parts' => [$prompt],
            'responseSchema' => $responseSchema,
            'systemInstruction' => $systemInstruction,
            'model' => $model,
        ], fn () => $this->defaultJson);
    }

    public function generateJsonFromParts(array $parts, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array
    {
        return $this->record('generateJsonFromParts', [
            'prompt' => $this->flatten($parts),
            'parts' => $parts,
            'responseSchema' => $responseSchema,
            'systemInstruction' => $systemInstruction,
            'model' => $model,
        ], fn () => $this->defaultJson);
    }

    public function chat(array $messages, ?string $systemInstruction = null, ?string $model = null): string
    {
        return $this->record('chat', [
            'messages' => $messages,
            'prompt' => $messages === [] ? '' : (string) (end($messages)['content'] ?? ''),
            'systemInstruction' => $systemInstruction,
            'model' => $model,
        ], fn () => $this->defaultText);
    }

    public function textToSpeech(string $text): string
    {
        return $this->record('textToSpeech', [
            'prompt' => $text,
            'text' => $text,
        ], fn () => $this->defaultAudio);
    }

    /*
    |--------------------------------------------------------------------------
    | Inspection
    |--------------------------------------------------------------------------
    */

    /**
     * Every recorded call, in order. Each entry has a 'method' key plus the
     * arguments that method received.
     *
     * @return array<int, array<string, mixed>>
     */
    public function calls(?string $method = null): array
    {
        if ($method === null) {
            return $this->calls;
        }

        return array_values(array_filter(
            $this->calls,
            static fn (array $call) => $call['method'] === $method,
        ));
    }

    /**
     * @return array<string, mixed>|null
     */
    public function lastCall(?string $method = null): ?array
    {
        $calls = $this->calls($method);

        return $calls === [] ? null : $calls[count($calls) - 1];
    }

    public function callCount(?string $method = null): int
    {
        return count($this->calls($method));
    }

    /**
     * @param  (callable(array<string, mixed>): bool)|null  $callback
     */
    public function assertCalled(string $method, ?callable $callback = null): static
    {
        $calls = $this->calls($method);

        PHPUnit::assertNotEmpty($calls, "Expected GeminiClient::{$method}() to be called, but it was not.");

        if ($callback !== null) {
            PHPUnit::assertNotEmpty(
                array_filter($calls, static fn (array $call) => (bool) $callback($call)),
                "GeminiClient::{$method}() was called, but no call matched the given expectation.",
            );
        }

        return $this;
    }

    public function assertNotCalled(string $method): static
    {
        PHPUnit::assertEmpty(
            $this->calls($method),
            "Expected GeminiClient::{$method}() never to be called.",
        );

        return $this;
    }

    public function assertCallCount(string $method, int $times): static
    {
        PHPUnit::assertCount(
            $times,
            $this->calls($method),
            "Expected GeminiClient::{$method}() to be called {$times} time(s).",
        );

        return $this;
    }

    public function assertNothingSent(): static
    {
        PHPUnit::assertEmpty($this->calls, 'Expected no Gemini calls, but some were made.');

        return $this;
    }

    /**
     * Assert that some call carried a prompt containing $needle.
     */
    public function assertPromptContains(string $needle, ?string $method = null): static
    {
        $prompts = array_map(
            static fn (array $call) => (string) ($call['prompt'] ?? ''),
            $this->calls($method),
        );

        PHPUnit::assertNotEmpty($prompts, 'Expected a Gemini call carrying a prompt, but none was made.');

        PHPUnit::assertTrue(
            array_filter($prompts, static fn (string $prompt) => str_contains($prompt, $needle)) !== [],
            "No Gemini prompt contained [{$needle}]. Prompts sent: ".json_encode($prompts),
        );

        return $this;
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<int, mixed>  $responses
     */
    private function push(string $method, array $responses): static
    {
        foreach ($responses as $response) {
            $this->queues[$method][] = $response;
        }

        return $this;
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    private function record(string $method, array $arguments, callable $default): mixed
    {
        $this->calls[] = ['method' => $method] + $arguments;

        $bucket = $this->bucket($method);

        if (isset($this->failures[$bucket])) {
            $exception = $this->failures[$bucket];
            unset($this->failures[$bucket]);

            throw $exception;
        }

        if (! empty($this->queues[$bucket])) {
            return array_shift($this->queues[$bucket]);
        }

        return $default();
    }

    /**
     * The *FromParts variants share a queue with their plain counterparts, so a
     * test can queue a response without caring which overload the code picked.
     */
    private function bucket(string $method): string
    {
        return match ($method) {
            'generateTextFromParts' => 'generateText',
            'generateJsonFromParts' => 'generateJson',
            default => $method,
        };
    }

    /**
     * @param  array<int, string|array<string, mixed>>  $parts
     */
    private function flatten(array $parts): string
    {
        $text = [];

        foreach ($parts as $part) {
            if (is_string($part)) {
                $text[] = $part;
            } elseif (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                $text[] = $part['text'];
            }
        }

        return implode("\n", $text);
    }
}
