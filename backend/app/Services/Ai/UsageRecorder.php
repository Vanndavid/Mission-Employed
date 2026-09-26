<?php

namespace App\Services\Ai;

/**
 * Where token usage goes. GeminiService reports every reply's usageMetadata
 * here and knows nothing about how it is stored.
 */
interface UsageRecorder
{
    /**
     * Must never throw: a failed usage write must not fail the feature.
     *
     * @param  array<string, mixed>  $usageMetadata  As Gemini sent it.
     * @param  string|null  $feature  Defaults to the current route's pattern.
     * @param  string  $source  'server' when GeminiService saw the call, 'live'
     *                          when the browser reported it.
     */
    public function record(string $model, array $usageMetadata, ?string $feature = null, string $source = 'server'): void;
}
