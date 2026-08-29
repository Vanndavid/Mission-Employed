<?php

namespace App\Http\Controllers\Ai;

use App\Models\AiSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read back a stored session and its transcript.
 *
 * This is what makes "a conversation survives a refresh" true rather than
 * merely intended. The Express version held chats in an in-memory Map, so
 * there was nothing to read back and no endpoint like this to write; moving
 * them into ai_sessions is only useful if the client can find one again.
 */
class SessionController extends AiController
{
    public function show(Request $request, AiSession $session): JsonResponse
    {
        return response()->json([
            'session' => $this->sessionPayload($this->ownedSession($request, $session)),
        ]);
    }
}
