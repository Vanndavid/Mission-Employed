import { describe, expect, it } from 'vitest';
import { base64ToFloat32, downsampleToPcm16, int16ToBase64 } from './pcm';

/**
 * Gemini Live takes 16 kHz 16-bit little-endian PCM and answers in 24 kHz of
 * the same. The microphone gives Float32 at whatever rate the device runs, so
 * both directions are converted here rather than trusted to sound right.
 */
describe('downsampleToPcm16', () => {
  it('averages each window of samples down to the target rate', () => {
    // 48 kHz to 16 kHz: every three samples become one.
    const input = Float32Array.from([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);

    const out = downsampleToPcm16(input, 48000, 16000);

    expect(Array.from(out)).toEqual([Math.round(0.3 * 0x7fff), Math.round(-0.6 * 0x8000)]);
  });

  it('passes samples through when the rates already match', () => {
    const out = downsampleToPcm16(Float32Array.from([0, 1, -1]), 16000, 16000);

    expect(Array.from(out)).toEqual([0, 0x7fff, -0x8000]);
  });

  it('clips anything outside [-1, 1] instead of wrapping around', () => {
    const out = downsampleToPcm16(Float32Array.from([1.7, -3]), 16000, 16000);

    expect(Array.from(out)).toEqual([0x7fff, -0x8000]);
  });
});

describe('int16ToBase64 and base64ToFloat32', () => {
  it('round-trip little-endian samples', () => {
    const samples = Int16Array.from([0, 0x4000, -0x8000, 0x7fff]);

    const back = base64ToFloat32(int16ToBase64(samples));

    expect(Array.from(back)).toEqual([0, 0.5, -1, 0x7fff / 0x8000]);
  });

  it('writes little-endian bytes whatever the platform', () => {
    // 0x0102 as little-endian is the bytes 02 01.
    expect(int16ToBase64(Int16Array.from([0x0102]))).toBe(btoa('\x02\x01'));
  });
});
