<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\DocumentRequest;
use App\Http\Requests\Ai\DocumentSessionRequest;
use App\Models\AiSession;
use App\Services\Ai\DocumentPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * The tailored cover letter and CV.
 *
 * Ported from `generateCoverLetter` and `generateTailoredCV`, plus their
 * refine chats. Opening a refine session makes no model call; its turns go
 * through {@see SessionMessageController} like the coding tutor's, instead of
 * a third and fourth copy of the same handler.
 */
class DocumentController extends AiController
{
    public function coverLetter(DocumentRequest $request, GeminiClient $gemini): JsonResponse
    {
        return $this->write(
            fn () => $gemini->generateText(DocumentPrompts::coverLetter($request->document())),
            'cover letter generation',
        );
    }

    public function cv(DocumentRequest $request, GeminiClient $gemini): JsonResponse
    {
        return $this->write(
            fn () => $gemini->generateText(DocumentPrompts::tailoredCv($request->document())),
            'tailored CV generation',
        );
    }

    public function coverLetterSession(DocumentSessionRequest $request): JsonResponse
    {
        return $this->openRefineSession($request, 'cover_letter', DocumentPrompts::coverLetterRefineInstruction(...));
    }

    public function cvSession(DocumentSessionRequest $request): JsonResponse
    {
        return $this->openRefineSession($request, 'cv', DocumentPrompts::cvRefineInstruction(...));
    }

    /** @param  callable(array{company: string, role: string, jobDescription: string, document: string}): string  $instruction */
    private function openRefineSession(DocumentSessionRequest $request, string $kind, callable $instruction): JsonResponse
    {
        $refine = $request->refine();

        $session = AiSession::create([
            'user_id' => $request->user()->id,
            'kind' => $kind,
            'system_instruction' => $instruction($refine),
            'context' => ['company' => $refine['company'], 'role' => $refine['role']],
        ]);

        return response()->json(['session' => $this->sessionPayload($session)], 201);
    }

    /** @param  callable(): string  $generate */
    private function write(callable $generate, string $operation): JsonResponse
    {
        try {
            $text = $generate();
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, $operation);
        }

        return response()->json(['text' => trim($text)]);
    }
}
