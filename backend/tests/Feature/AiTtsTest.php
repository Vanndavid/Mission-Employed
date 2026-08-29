<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Ai\PcmWavEncoder;
use App\Services\FakeGeminiService;
use App\Services\GeminiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Gemini's TTS reply is base64 *headerless* PCM at audio/L16;rate=24000. The
 * decision (recorded in TASKS.md) is that the server adds the WAV container, so
 * these tests check the bytes rather than just the status code.
 */
class AiTtsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Sanctum::actingAs(User::factory()->premium()->create());
    }

    public function test_it_returns_playable_wav_audio(): void
    {
        // 8 samples of silence: the shape matters, the content does not.
        $pcm = str_repeat("\x00\x01", 8);

        $gemini = FakeGeminiService::swap()->queueAudio(base64_encode($pcm));

        $response = $this->postJson('/api/ai/tts', ['text' => 'Tell me about a conflict you resolved.']);

        $response->assertOk()
            ->assertJsonPath('mimeType', 'audio/wav')
            ->assertJsonPath('sampleRate', 24000);

        $gemini->assertCallCount('textToSpeech', 1)
            ->assertPromptContains('Tell me about a conflict you resolved.');

        $wav = base64_decode($response->json('audio'), true);

        $this->assertSame(44 + strlen($pcm), strlen($wav));
        $this->assertSame('RIFF', substr($wav, 0, 4));
        $this->assertSame('WAVE', substr($wav, 8, 4));
        $this->assertSame($pcm, substr($wav, 44));

        $header = unpack('Vsize/A4wave/A4fmt/Vfmtsize/vformat/vchannels/Vrate/Vbyterate/vblockalign/vbits', substr($wav, 4, 40));

        $this->assertSame(36 + strlen($pcm), $header['size']);
        $this->assertSame(1, $header['format']);   // 1 = uncompressed PCM
        $this->assertSame(1, $header['channels']);
        $this->assertSame(24000, $header['rate']);
        $this->assertSame(16, $header['bits']);
        $this->assertSame(48000, $header['byterate']);
    }

    public function test_undecodable_audio_is_a_clean_error_not_a_broken_file(): void
    {
        FakeGeminiService::swap()->queueAudio('!!! not base64 !!!');

        $this->postJson('/api/ai/tts', ['text' => 'Anything'])
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');
    }

    public function test_it_requires_text_to_speak(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/tts', ['text' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('text');

        $gemini->assertNothingSent();
    }

    public function test_a_free_user_cannot_use_speech(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/tts', ['text' => 'Anything'])
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }

    public function test_the_encoder_rejects_an_empty_payload(): void
    {
        $this->expectException(GeminiException::class);

        PcmWavEncoder::wrap('');
    }
}
