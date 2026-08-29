<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\SessionMessageRequest;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * One chat turn against a stored session — the replacement for
 * `sendCodingChat`, `sendCoverLetterChat` and `sendCVChat`, which were three
 * copies of the same six lines over an in-memory `Map`.
 *
 * The Node SDK held a live `chat` object per session, so history was implicit.
 * GeminiService is stateless by design, so the transcript is read back out of
 * `ai_messages` and replayed on every turn.
 */
class SessionMessageController extends AiController
{
    public function store(SessionMessageRequest $request, AiSession $session, GeminiClient $gemini): JsonResponse
    {
        $session = $this->ownedSession($request, $session);

        // The mock interview needs a JSON reply and inline audio, so it has its
        // own turn endpoint. Everything else is a plain text conversation.
        if ($session->kind === 'mock') {
            return response()->json([
                'message' => 'Mock interview turns go through /api/ai/mock/sessions/{session}/turns.',
                'code' => 'wrong_session_kind',
            ], 422);
        }

        $message = $request->string('message')->value();

        $history = $this->history($session)
            ->map(fn (AiMessage $stored) => ['role' => $stored->role, 'content' => $stored->content])
            ->all();

        // chat() requires the turn being answered to be last.
        $history[] = ['role' => 'user', 'content' => $message];

        try {
            $reply = $gemini->chat($history, $session->system_instruction);
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, "chat turn on session {$session->id}");
        }

        // Only persist once the model has actually answered: a failed turn must
        // not leave a dangling user message that the next replay would resend.
        [$userMessage, $modelMessage] = DB::transaction(fn () => [
            $this->appendMessage($session, 'user', $message),
            $this->appendMessage($session, 'model', $reply),
        ]);

        return response()->json([
            'text' => $reply,
            'message' => $this->messagePayload($userMessage),
            'reply' => $this->messagePayload($modelMessage),
        ]);
    }
}
