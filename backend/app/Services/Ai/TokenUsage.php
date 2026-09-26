<?php

namespace App\Services\Ai;

/**
 * A reply's `usageMetadata`, normalised.
 *
 * `generateContent` says `candidatesTokenCount` / `candidatesTokensDetails`,
 * while Gemini Live says `responseTokenCount` / `responseTokensDetails`; both
 * land here. Anything missing or malformed counts as zero.
 */
final class TokenUsage
{
    public function __construct(
        public readonly int $prompt,
        public readonly int $output,
        public readonly int $thoughts,
        public readonly int $total,
        public readonly int $audioPrompt,
        public readonly int $audioOutput,
    ) {}

    /** @param  array<string, mixed>  $metadata */
    public static function fromMetadata(array $metadata): self
    {
        $prompt = self::count($metadata['promptTokenCount'] ?? 0);
        $output = self::count($metadata['candidatesTokenCount'] ?? $metadata['responseTokenCount'] ?? 0);
        $thoughts = self::count($metadata['thoughtsTokenCount'] ?? 0);
        $total = self::count($metadata['totalTokenCount'] ?? 0) ?: $prompt + $output + $thoughts;

        return new self(
            prompt: $prompt,
            output: $output,
            thoughts: $thoughts,
            total: $total,
            // Capped at their totals, so a reply whose details over-count cannot
            // turn the text share negative.
            audioPrompt: min($prompt, self::audio($metadata['promptTokensDetails'] ?? [])),
            audioOutput: min($output, self::audio(
                $metadata['candidatesTokensDetails'] ?? $metadata['responseTokensDetails'] ?? [],
            )),
        );
    }

    public function isEmpty(): bool
    {
        return $this->total === 0;
    }

    private static function count(mixed $value): int
    {
        return is_int($value) || (is_string($value) && ctype_digit($value)) ? max(0, (int) $value) : 0;
    }

    private static function audio(mixed $details): int
    {
        if (! is_array($details)) {
            return 0;
        }

        $audio = 0;
        foreach ($details as $detail) {
            if (is_array($detail) && ($detail['modality'] ?? null) === 'AUDIO') {
                $audio += self::count($detail['tokenCount'] ?? 0);
            }
        }

        return $audio;
    }
}
