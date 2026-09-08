<?php

namespace App\Services\Seek;

use RuntimeException;

/**
 * Thrown for every Seek job-search failure.
 *
 * The message is generic and free of upstream content, matching GeminiException:
 * the HTTP layer must never echo {@see self::detail()} to a client.
 *
 * The originating Illuminate HTTP exception is intentionally *not* chained as
 * `previous`, because `RequestException::getMessage()` embeds the response
 * body and would resurface it through Laravel's debug renderer.
 */
class SeekException extends RuntimeException
{
    /** Upstream detail is truncated before it is ever stored. */
    public const DETAIL_LIMIT = 2000;

    private ?string $detail = null;

    private ?int $status = null;

    public static function fromStatus(int $status, ?string $body = null): self
    {
        $exception = new self(sprintf('Seek job search failed with HTTP %d.', $status));
        $exception->status = $status;
        $exception->detail = self::truncate($body);

        return $exception;
    }

    public static function transportFailure(string $reason): self
    {
        $exception = new self('Could not reach Seek.');
        $exception->detail = self::truncate($reason);

        return $exception;
    }

    public static function malformedJson(?string $raw = null): self
    {
        $exception = new self('Seek returned a reply that could not be decoded as JSON.');
        $exception->detail = self::truncate($raw);

        return $exception;
    }

    /** Raw upstream detail. For logs only — never return this to a client. */
    public function detail(): ?string
    {
        return $this->detail;
    }

    public function status(): ?int
    {
        return $this->status;
    }

    /**
     * Structured payload for Log::error('...', $e->context()).
     *
     * @return array<string, mixed>
     */
    public function context(): array
    {
        return array_filter([
            'status' => $this->status,
            'detail' => $this->detail,
        ], static fn ($value) => $value !== null);
    }

    private static function truncate(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return mb_strlen($value) > self::DETAIL_LIMIT
            ? mb_substr($value, 0, self::DETAIL_LIMIT).'… [truncated]'
            : $value;
    }
}
