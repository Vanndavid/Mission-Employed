import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { playSpokenClip } from './speech';

/**
 * The API returns a complete WAV -- PcmWavEncoder prepends the 44-byte RIFF
 * header server-side. An earlier version pushed those bytes through a raw-PCM
 * decoder written for the Gemini SDK's output, which read the header as audio
 * samples. These assert on what actually reaches the audio element rather than
 * trusting that it sounds right, since nobody can hear a test.
 */

class FakeAudio {
  static last: FakeAudio | null = null;

  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    this.src = src;
    FakeAudio.last = this;
  }
}

/** A minimal but real WAV: 44-byte RIFF header plus one 16-bit sample. */
function wavBase64(): string {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 38, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  ascii(36, 'data');
  view.setUint32(40, 2, true);
  view.setInt16(44, 1234, true);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('playSpokenClip', () => {
  beforeEach(() => {
    FakeAudio.last = null;
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands the audio element a playable wav data url, byte for byte', async () => {
    const base64 = wavBase64();

    const playing = playSpokenClip(base64);
    FakeAudio.last?.onended?.();
    await playing;

    const src = FakeAudio.last?.src ?? '';
    expect(src.startsWith('data:audio/wav;base64,')).toBe(true);

    // The payload must survive untouched -- no re-encoding, no header surgery.
    const delivered = src.slice('data:audio/wav;base64,'.length);
    expect(delivered).toBe(base64);

    // And it must still be a RIFF/WAVE stream when it gets there.
    const decoded = atob(delivered);
    expect(decoded.slice(0, 4)).toBe('RIFF');
    expect(decoded.slice(8, 12)).toBe('WAVE');
  });

  it('resolves only once playback has finished', async () => {
    let settled = false;
    const playing = playSpokenClip(wavBase64()).then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);

    FakeAudio.last?.onended?.();
    await playing;
    expect(settled).toBe(true);
  });

  /**
   * A rejection lets the caller clear its speaking state. Swallowing the error
   * would leave the UI stuck mid-sentence on a promise that never settles.
   */
  it('rejects when the browser refuses to play', async () => {
    const playing = playSpokenClip(wavBase64());
    FakeAudio.last?.onerror?.();

    await expect(playing).rejects.toThrow('could not be played');
  });
});
