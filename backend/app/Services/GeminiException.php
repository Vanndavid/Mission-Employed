<?php

namespace App\Services;

use RuntimeException;

/**
 * Thrown for every Gemini failure.
 *
 * The message is deliberately generic and free of upstream content: the old
 * Express `asyncHandler` did `res.status(500).json({ error: e.message })`,
 * which piped raw Google error bodies straight to the browser. Here the
 * upstream body lives only in {@see GeminiException::detail()}, which the HTTP
 * layer must never echo — log it, never render it.
 *
 * The originating Illuminate HTTP exception is intentionally *not* chained as
 * `previous`, because `RequestException::getMessage()` embeds the response
 * body and would resurface it through Laravel's debug renderer.
 */
class GeminiException extends RuntimeException
{
    /** Upstream detail is truncated before it is ever stored. */
    public const DETAIL_LIMIT = 2000;

    private ?string $detail = null;

    private ?int $status = null;

    private ?string $model = null;

    public static function missingApiKey(): self
    {
        return new self('Gemini is not configured: services.gemini.key is empty.');
    }

    public static function fromStatus(int $status, string $model, ?string $body = null): self
    {
        $exception = new self(sprintf(
            'Gemini request failed with HTTP %d for model "%s".',
            $status,
            $model,
        ));

        $exception->status = $status;
        $exception->model = $model;
        $exception->detail = self::truncate($body);

        return $exception;
    }

    public static function transportFailure(string $model, string $reason): self
    {
        $exception = new self(sprintf('Could not reach the Gemini API for model "%s".', $model));
        $exception->model = $model;
        $exception->detail = self::truncate($reason);

        return $exception;
    }

    public static function malformedJson(string $model, ?string $raw = null): self
    {
        $exception = new self(sprintf(
            'Gemini returned a reply for model "%s" that could not be decoded as JSON.',
            $model,
        ));

        $exception->model = $model;
        $exception->detail = self::truncate($raw);

        return $exception;
    }

    public static function emptyResponse(string $model, ?string $raw = null): self
    {
        $exception = new self(sprintf('Gemini returned no usable content for model "%s".', $model));
        $exception->model = $model;
        $exception->detail = self::truncate($raw);

        return $exception;
    }

    public static function blocked(string $model, string $reason): self
    {
        $exception = new self(sprintf(
            'Gemini refused the request for model "%s" (reason: %s).',
            $model,
            $reason,
        ));

        $exception->model = $model;

        return $exception;
    }

    /** Bad input from our own code — never contains upstream content. */
    public static function invalidRequest(string $message): self
    {
        return new self($message);
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

    public function model(): ?string
    {
        return $this->model;
    }

    /**
     * Structured payload for Log::error('...', $e->context()).
     *
     * @return array<string, mixed>
     */
    public function context(): array
    {
        return array_filter([
            'model' => $this->model,
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
