<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\CodingProblemRequest;
use App\Http\Requests\Ai\CodingSessionRequest;
use App\Models\AiSession;
use App\Services\Ai\CodingPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * Coding practice: problem generation and the tutor session.
 *
 * Ported from `generateCodingProblem` and `createCodingSession`. The tutor's
 * turns are handled by {@see SessionMessageController}, which serves every chat
 * session kind rather than one route per feature as the Express version had.
 */
class CodingController extends AiController
{
    public function problem(CodingProblemRequest $request, GeminiClient $gemini): JsonResponse
    {
        $difficulty = $request->difficulty();

        try {
            $problem = $gemini->generateJson(
                CodingPrompts::problem($difficulty),
                CodingPrompts::problemSchema(),
            );
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'coding problem generation');
        }

        return response()->json([
            'title' => trim($this->text($problem['title'] ?? null)),
            'description' => trim($this->text($problem['description'] ?? null)),
            'examples' => $this->strings($problem['examples'] ?? null),
            'topics' => $this->strings($problem['topics'] ?? null),
        ]);
    }

    /**
     * Open a tutor session for a problem.
     *
     * No model call happens here: the Node version only built a chat object,
     * and the first exchange is the student's opening message. The persona is
     * stored once and replayed as the system instruction on every turn.
     */
    public function store(CodingSessionRequest $request): JsonResponse
    {
        $title = $request->string('problemTitle')->trim()->value();
        $description = $request->string('problemDescription')->trim()->value();

        $session = AiSession::create([
            'user_id' => $request->user()->id,
            'kind' => 'coding',
            'system_instruction' => CodingPrompts::tutorInstruction($title, $description),
            'context' => [
                'problemTitle' => $title,
                'problemDescription' => $description,
            ],
        ]);

        return response()->json(['session' => $this->sessionPayload($session)], 201);
    }
}
