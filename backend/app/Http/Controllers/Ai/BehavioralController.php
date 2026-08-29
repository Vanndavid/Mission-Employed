<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\BehavioralEvaluateRequest;
use App\Http\Requests\Ai\BehavioralPromptRequest;
use App\Services\Ai\BehavioralPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * One-question interview practice: ask a question, evaluate the spoken answer.
 *
 * Ported from `generateBehavioralPrompt` and `processAudioResponse`.
 */
class BehavioralController extends AiController
{
    public function prompt(BehavioralPromptRequest $request, GeminiClient $gemini): JsonResponse
    {
        $theme = $request->string('theme')->trim()->value();

        try {
            $text = $gemini->generateText(BehavioralPrompts::question($theme));
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'behavioral prompt generation');
        }

        return response()->json(['text' => trim($text)]);
    }

    /**
     * Transcribe and critique a spoken answer.
     *
     * The audio rides along as an inline part, which is why this goes through
     * generateJsonFromParts() rather than generateJson(). The Node version
     * asked for prose and then recovered the transcript with
     * `text.match(/TRANSCRIPT:([\s\S]*?)###/)`; the schema does that job now.
     */
    public function evaluate(BehavioralEvaluateRequest $request, GeminiClient $gemini): JsonResponse
    {
        $theme = $request->string('theme')->trim()->value();
        $prompt = $request->string('prompt')->trim()->value();

        $parts = [
            ['inlineData' => [
                'mimeType' => 'audio/webm',
                'data' => $request->string('audioBase64')->value(),
            ]],
            ['text' => BehavioralPrompts::evaluation($prompt, $theme, $request->facts())],
        ];

        try {
            $result = $gemini->generateJsonFromParts($parts, BehavioralPrompts::evaluationSchema());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'behavioral answer evaluation');
        }

        return response()->json([
            'transcript' => trim($this->text($result['transcript'] ?? null)),
            'feedback' => trim($this->text($result['feedback'] ?? null)),
        ]);
    }
}
