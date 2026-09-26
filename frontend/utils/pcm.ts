/**
 * Raw PCM conversion for the Gemini Live mock interview.
 *
 * Live takes 16 kHz 16-bit little-endian mono in and answers with 24 kHz of the
 * same. The browser's microphone gives Float32 at the device's own rate (often
 * 48 kHz), and Web Audio plays Float32, so both directions convert here.
 */

/** The sample rate Gemini Live expects from the microphone. */
export const LIVE_INPUT_RATE = 16000;

/** The sample rate of the audio Gemini Live speaks back. */
export const LIVE_OUTPUT_RATE = 24000;

function toInt16(sample: number): number {
  const clipped = Math.max(-1, Math.min(1, sample));
  return clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff);
}

/**
 * Downsample Float32 samples to 16-bit PCM by averaging each window. Averaging
 * is a crude low-pass filter, but enough for speech, which carries little
 * above the 8 kHz the target rate keeps.
 */
export function downsampleToPcm16(
  input: Float32Array,
  inputRate: number,
  outputRate: number = LIVE_INPUT_RATE,
): Int16Array {
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = toInt16(sum / Math.max(1, end - start));
  }

  return out;
}

/** Base64 of the samples as little-endian bytes, as Live's `audio/pcm` wants. */
export function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Base64 little-endian 16-bit PCM, as Live sends it, to Float32 for Web Audio. */
export function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));

  const out = new Float32Array(Math.floor(binary.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}
