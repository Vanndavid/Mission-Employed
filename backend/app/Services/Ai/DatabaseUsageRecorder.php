<?php

namespace App\Services\Ai;

use App\Models\AiUsage;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Writes one ai_usage row per call, attributed to the signed-in user and the
 * route being served. MCP calls come through the same API, so they are
 * attributed the same way.
 */
class DatabaseUsageRecorder implements UsageRecorder
{
    public function record(string $model, array $usageMetadata, ?string $feature = null, string $source = 'server'): void
    {
        try {
            $usage = TokenUsage::fromMetadata($usageMetadata);

            if ($usage->isEmpty()) {
                return;
            }

            $model = preg_replace('#^models/#', '', $model) ?? $model;

            AiUsage::create([
                'user_id' => Auth::id(),
                'feature' => $feature ?? $this->currentFeature(),
                'model' => $model,
                'source' => $source,
                'prompt_tokens' => $usage->prompt,
                'output_tokens' => $usage->output,
                'thought_tokens' => $usage->thoughts,
                'total_tokens' => $usage->total,
                'cost_micros' => UsagePricing::costMicros($model, $usage),
            ]);
        } catch (Throwable $exception) {
            Log::warning('Could not record AI usage: '.$exception->getMessage(), ['model' => $model]);
        }
    }

    /** `ai/job/parse` for `/api/ai/job/parse`: the pattern, never the ids. */
    private function currentFeature(): string
    {
        $uri = request()->route()?->uri();

        return is_string($uri) && $uri !== '' ? (preg_replace('#^api/#', '', $uri) ?? $uri) : 'console';
    }
}
