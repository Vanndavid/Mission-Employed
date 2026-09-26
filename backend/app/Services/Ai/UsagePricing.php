<?php

namespace App\Services\Ai;

/**
 * Estimated cost of one call, from config/ai_pricing.php.
 */
final class UsagePricing
{
    /** Micro-dollars, or null when the model has no known price. */
    public static function costMicros(string $model, TokenUsage $usage): ?float
    {
        $model = preg_replace('#^models/#', '', $model) ?? $model;
        // Not config("ai_pricing.models.{$model}"): dot notation would split
        // "gemini-3.7-flash" at the dot in the version number.
        $price = ((array) config('ai_pricing.models', []))[$model] ?? null;

        if (! is_array($price) || ! isset($price['input'], $price['output'])) {
            return null;
        }

        $input = (float) $price['input'];
        $output = (float) $price['output'];
        $audioInput = (float) ($price['audio_input'] ?? $input);
        $audioOutput = (float) ($price['audio_output'] ?? $output);

        return ($usage->prompt - $usage->audioPrompt) * $input
            + $usage->audioPrompt * $audioInput
            + ($usage->output - $usage->audioOutput) * $output
            + $usage->audioOutput * $audioOutput
            + $usage->thoughts * $output;
    }
}
