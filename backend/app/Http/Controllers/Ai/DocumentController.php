<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\DocumentRequest;
use App\Services\Ai\DocumentPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * The tailored cover letter and CV.
 *
 * Ported from `generateCoverLetter` and `generateTailoredCV`. Their refine-chat
 * siblings have no route yet; if they return they can use the shared session
 * turn endpoint instead of a third and fourth copy of the same handler.
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
