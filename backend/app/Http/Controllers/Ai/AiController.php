<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Services\GeminiException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Shared plumbing for the AI endpoints.
 *
 * Two things every subclass needs and must not reimplement:
 *
 * 1. **Failure containment.** The Express `asyncHandler` did
 *    `res.status(500).json({ error: e.message })`, which shipped raw Google
 *    error bodies to the browser. Every Gemini call here is wrapped in a
 *    `catch (GeminiException)` that funnels into {@see self::geminiFailure()}:
 *    the upstream detail goes to the log, the client gets a fixed sentence.
 * 2. **Ownership.** Sessions are per-user. Someone else's session must look
 *    like it does not exist, so the check aborts 404 rather than 403.
 */
abstract class AiController extends Controller
{
    /**
     * How many stored turns get replayed to the model.
     *
     * Every turn resends the whole transcript, so cost grows quadratically with
     * session length (noted under Open questions in TASKS.md). The cheap cap is
     * a sliding window: the persona lives in `system_instruction` and is resent
     * in full every time, so dropping the oldest turns loses context but never
     * the task itself.
     */
    public const HISTORY_LIMIT = 40;

    /** Bad gateway: the request was fine, the dependency was not. */
    protected const UPSTREAM_STATUS = 502;

    /**
     * Turn a contained Gemini failure into a client-safe response.
     *
     * Never put `$e->detail()` — or anything else derived from the upstream
     * body — into the payload. It is logged and nothing more.
     */
    protected function geminiFailure(GeminiException $exception, string $operation): JsonResponse
    {
        Log::error("AI request failed during {$operation}: ".$exception->getMessage(), $exception->context());

        return response()->json([
            'message' => 'The AI service is unavailable right now. Please try again in a moment.',
            'code' => 'ai_unavailable',
        ], self::UPSTREAM_STATUS);
    }

    /**
     * Resolve a route-bound session for the current user.
     *
     * @param  string|null  $kind  When given, a session of another kind is also
     *                             treated as missing — a coding session must not
     *                             be reachable through the mock routes.
     */
    protected function ownedSession(Request $request, AiSession $session, ?string $kind = null): AiSession
    {
        abort_if($session->user_id !== $request->user()->id, 404, 'Session not found.');
        abort_if($kind !== null && $session->kind !== $kind, 404, 'Session not found.');

        return $session;
    }

    /**
     * The stored turns, oldest first, capped to the replay window.
     *
     * @return Collection<int, AiMessage>
     */
    protected function history(AiSession $session): mixed
    {
        $total = $session->messages()->count();
        $skip = max(0, $total - self::HISTORY_LIMIT);

        return $session->messages()->skip($skip)->take(self::HISTORY_LIMIT)->get();
    }

    /**
     * Append a turn at the next free sequence.
     */
    protected function appendMessage(AiSession $session, string $role, string $content): AiMessage
    {
        return $session->messages()->create([
            'role' => $role,
            'content' => $content,
            'sequence' => $session->nextSequence(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function sessionPayload(AiSession $session, bool $withMessages = true): array
    {
        $payload = [
            'id' => $session->id,
            'kind' => $session->kind,
            'context' => $session->context,
            'createdAt' => $session->created_at?->toJSON(),
            'updatedAt' => $session->updated_at?->toJSON(),
        ];

        if ($withMessages) {
            $payload['messages'] = $session->messages()->get()
                ->map(fn (AiMessage $message) => $this->messagePayload($message))
                ->all();
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    protected function messagePayload(AiMessage $message): array
    {
        return [
            'id' => $message->id,
            'role' => $message->role,
            'content' => $message->content,
            'sequence' => $message->sequence,
        ];
    }

    /** Coerce a model-supplied value to a string; anything odd becomes ''. */
    protected function text(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    /**
     * Coerce a model-supplied value to a list of non-empty strings.
     *
     * @return list<string>
     */
    protected function strings(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($item) => trim($this->text($item)), $value),
            static fn (string $item) => $item !== '',
        ));
    }
}
