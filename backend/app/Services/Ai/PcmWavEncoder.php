<?php

namespace App\Services\Ai;

use App\Services\GeminiException;

/**
 * Wraps Gemini's raw TTS output in a WAV container.
 *
 * `textToSpeech()` returns base64 *headerless* PCM at `audio/L16;rate=24000`:
 * signed 16-bit little-endian mono samples and nothing else. No browser will
 * play that — an <audio src="data:audio/wav;base64,..."> needs the 44-byte RIFF
 * header this class prepends.
 *
 * The decision (recorded under Open questions in TASKS.md) is that the *server*
 * adds the header, so the client can hand the string straight to an <audio>
 * element without carrying a decoder of its own.
 */
class PcmWavEncoder
{
    public const SAMPLE_RATE = 24000;

    public const CHANNELS = 1;

    public const BITS_PER_SAMPLE = 16;

    public const MIME_TYPE = 'audio/wav';

    /**
     * @param  string  $base64Pcm  Raw PCM, base64 encoded, exactly as Gemini returns it.
     * @return string Base64 encoded WAV file.
     *
     * @throws GeminiException when the payload is not decodable base64.
     */
    public static function wrap(
        string $base64Pcm,
        int $sampleRate = self::SAMPLE_RATE,
        int $channels = self::CHANNELS,
        int $bitsPerSample = self::BITS_PER_SAMPLE,
    ): string {
        $pcm = base64_decode($base64Pcm, true);

        if ($pcm === false || $pcm === '') {
            // Not upstream content — our own read of it. Safe to surface.
            throw GeminiException::invalidRequest('Gemini returned audio that could not be decoded.');
        }

        return base64_encode(self::header(strlen($pcm), $sampleRate, $channels, $bitsPerSample).$pcm);
    }

    /** The canonical 44-byte RIFF/WAVE header for uncompressed PCM. */
    private static function header(int $dataLength, int $sampleRate, int $channels, int $bitsPerSample): string
    {
        $blockAlign = intdiv($channels * $bitsPerSample, 8);
        $byteRate = $sampleRate * $blockAlign;

        return pack(
            'A4VA4A4VvvVVvvA4V',
            'RIFF',
            36 + $dataLength,   // everything after this field
            'WAVE',
            'fmt ',
            16,                 // PCM fmt chunk size
            1,                  // audio format: 1 = PCM
            $channels,
            $sampleRate,
            $byteRate,
            $blockAlign,
            $bitsPerSample,
            'data',
            $dataLength,
        );
    }
}
