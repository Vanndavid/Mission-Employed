<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\TtsRequest;
use App\Services\Ai\PcmWavEncoder;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * Speak an interview question.
 *
 * Gemini hands back headerless PCM (`audio/L16;rate=24000`), which no <audio>
 * element will play. The server adds the WAV container — see
 * {@see PcmWavEncoder} and the TTS entry under Open questions in TASKS.md — so
 * the client can use the string as a `data:audio/wav;base64,` source directly.
 */
class TtsController extends AiController
{
    public function speak(TtsRequest $request, GeminiClient $gemini): JsonResponse
    {
        $text = $request->string('text')->trim()->value();

        try {
            $audio = PcmWavEncoder::wrap($gemini->textToSpeech($text));
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'speech synthesis');
        }

        return response()->json([
            'audio' => $audio,
            'mimeType' => PcmWavEncoder::MIME_TYPE,
            'sampleRate' => PcmWavEncoder::SAMPLE_RATE,
        ]);
    }
}
