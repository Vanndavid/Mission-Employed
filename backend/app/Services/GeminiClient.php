<?php

namespace App\Services;

/**
 * Transport-level contract for the Google Generative Language API.
 *
 * Every call is stateless: nothing is cached, no chat session is held in
 * memory, and no database is touched. Callers that need a multi-turn
 * conversation persist the turns themselves and replay them through
 * {@see GeminiClient::chat()}.
 *
 * A "part" is one element of a Gemini `contents[].parts[]` array. This client
 * accepts either a bare string (treated as a text part) or an array shaped
 * like one of:
 *   ['text' => 'hello']
 *   ['inlineData' => ['mimeType' => 'audio/webm', 'data' => $base64]]
 *
 * @phpstan-type GeminiPart string|array<string, mixed>
 * @phpstan-type GeminiMessage array{role: string, content: string}
 */
interface GeminiClient
{
    /**
     * Single-shot text generation.
     *
     * @throws GeminiException
     */
    public function generateText(string $prompt, ?string $systemInstruction = null, ?string $model = null): string;

    /**
     * Single-shot text generation from an explicit part list (text + inline
     * audio/image data). This is what the audio-driven interview flows use.
     *
     * @param  array<int, string|array<string, mixed>>  $parts
     *
     * @throws GeminiException
     */
    public function generateTextFromParts(array $parts, ?string $systemInstruction = null, ?string $model = null): string;

    /**
     * Structured generation. The schema is sent as
     * `generationConfig.responseSchema` alongside
     * `generationConfig.responseMimeType = application/json`, and the reply is
     * decoded. Throws if the model answers with something undecodable.
     *
     * @param  array<string, mixed>  $responseSchema
     * @return array<array-key, mixed>
     *
     * @throws GeminiException
     */
    public function generateJson(string $prompt, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array;

    /**
     * Structured generation from an explicit part list.
     *
     * @param  array<int, string|array<string, mixed>>  $parts
     * @param  array<string, mixed>  $responseSchema
     * @return array<array-key, mixed>
     *
     * @throws GeminiException
     */
    public function generateJsonFromParts(array $parts, array $responseSchema, ?string $systemInstruction = null, ?string $model = null): array;

    /**
     * Replay a full conversation and return the next model reply.
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     *                                                                      Ordered turns, oldest first. Roles are 'user' or 'model'. The
     *                                                                      last turn must be a 'user' turn — that is the message being
     *                                                                      answered.
     *
     * @throws GeminiException
     */
    public function chat(array $messages, ?string $systemInstruction = null, ?string $model = null): string;

    /**
     * Speak the given text. Returns raw base64 PCM audio exactly as Gemini
     * returns it (the caller decides whether to wrap it in a WAV container).
     *
     * @throws GeminiException
     */
    public function textToSpeech(string $text): string;
}
