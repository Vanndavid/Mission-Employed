<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\MockSessionRequest;
use App\Http\Requests\Ai\MockTurnRequest;
use App\Models\AiSession;
use App\Services\Ai\MockInterviewPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The full mock interview: multi-turn, spoken, ending in a written report.
 *
 * Ported from `conductInterviewTurn` and `generateMockReport`. A turn does not
 * use chat(): the Node handler re-sent the transcript inside a single prompt
 * because it needed a JSON reply next to inline audio, and that structure is
 * kept. What changed is that the transcript comes from `ai_messages` rather
 * than from whatever the browser was holding — the whole point of retiring the
 * in-memory session Map.
 */
class MockInterviewController extends AiController
{
    private const KIND = 'mock';

    public function store(MockSessionRequest $request): JsonResponse
    {
        $context = $request->companyContext();

        $session = AiSession::create([
            'user_id' => $request->user()->id,
            'kind' => self::KIND,
            'system_instruction' => MockInterviewPrompts::interviewerInstruction($context),
            'context' => $context,
        ]);

        return response()->json(['session' => $this->sessionPayload($session)], 201);
    }

    public function turn(MockTurnRequest $request, AiSession $session, GeminiClient $gemini): JsonResponse
    {
        $session = $this->ownedSession($request, $session, self::KIND);

        $audio = $request->audio();
        $typed = $request->typedAnswer();

        $historyText = MockInterviewPrompts::transcript($this->history($session));

        // A typed answer is not in the transcript yet and there is no audio for
        // the model to transcribe, so it has to be spelled out in the prompt.
        if ($typed !== null) {
            $historyText = trim($historyText."\nUser: {$typed}");
        }

        $parts = [];

        if ($audio !== null) {
            $parts[] = ['inlineData' => ['mimeType' => 'audio/webm', 'data' => $audio]];
        }

        $parts[] = ['text' => MockInterviewPrompts::turn(
            $session->system_instruction,
            $historyText,
            $audio !== null,
        )];

        try {
            $result = $gemini->generateJsonFromParts($parts, MockInterviewPrompts::turnSchema());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, "mock interview turn on session {$session->id}");
        }

        $transcript = trim($this->text($result['transcript'] ?? null));
        $nextPrompt = trim($this->text($result['nextPrompt'] ?? null));

        // The candidate's turn is whatever they actually said: the typed answer
        // when there is one, otherwise the model's transcription of the audio.
        $answer = $typed ?? ($transcript !== '' ? $transcript : null);

        DB::transaction(function () use ($session, $answer, $nextPrompt): void {
            if ($answer !== null) {
                $this->appendMessage($session, 'user', $answer);
            }

            if ($nextPrompt !== '') {
                $this->appendMessage($session, 'model', $nextPrompt);
            }
        });

        return response()->json([
            'transcript' => $transcript,
            'nextPrompt' => $nextPrompt,
        ]);
    }

    /**
     * Close the interview with a hiring decision report.
     *
     * Deliberately reads the whole transcript rather than the replay window:
     * this is one call at the end of the session, and a report that ignores the
     * opening answers is worthless.
     */
    public function report(Request $request, AiSession $session, GeminiClient $gemini): JsonResponse
    {
        $session = $this->ownedSession($request, $session, self::KIND);

        $historyText = MockInterviewPrompts::transcript($session->messages()->get(), 'Candidate');

        try {
            $report = $gemini->generateText(MockInterviewPrompts::report($session->context, $historyText));
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, "mock interview report on session {$session->id}");
        }

        $report = trim($report);

        $session->update(['report' => [
            'text' => $report,
            'generatedAt' => now()->toJSON(),
        ]]);

        return response()->json(['report' => $report]);
    }
}
