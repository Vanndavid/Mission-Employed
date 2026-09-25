import { TTS_MIME_TYPE } from '../services/apiClient';

/**
 * Play a spoken clip and resolve when it finishes.
 *
 * The API returns a complete WAV — `PcmWavEncoder` prepends the 44-byte RIFF
 * header server-side — so the bytes go straight to an <audio> element. An
 * earlier version ran them through a raw-PCM decoder written for the Gemini
 * SDK's output, which read the header as audio samples: a burst of noise, and
 * every frame after it misaligned by 22 samples.
 *
 * Rejects if the browser refuses to play, so callers can clear their speaking
 * state instead of hanging on a promise that never settles.
 *
 * @param signal  Aborting stops playback and resolves. The prep room uses this
 *                so hitting record cuts the question off rather than letting
 *                the interviewer's voice bleed into the recording.
 */
export function playSpokenClip(base64Wav: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const audio = new Audio(`data:${TTS_MIME_TYPE};base64,${base64Wav}`);

    const stop = () => {
      audio.pause?.();
      resolve();
    };

    audio.onended = () => {
      signal?.removeEventListener('abort', stop);
      resolve();
    };
    audio.onerror = () => {
      signal?.removeEventListener('abort', stop);
      reject(new Error('The spoken clip could not be played.'));
    };

    signal?.addEventListener('abort', stop, { once: true });

    audio.play().catch(reject);
  });
}

/** Below this, the remainder is spoken with the first sentence rather than as its own clip. */
const MIN_REMAINDER_WORDS = 4;

/**
 * Split text into the first sentence and everything after it, so the two can
 * be synthesised in parallel and played in order.
 *
 * Gemini's TTS builds a whole clip before it answers, so the silence before
 * playback grows with the length of the text. The first sentence is usually
 * short ("Yes, that's correct!"), so its clip comes back quickly, and the rest
 * is ready by the time it has been spoken.
 */
export function splitForSpeech(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];

  const match = /^(.+?[.!?])\s+(.+)$/s.exec(trimmed);
  if (!match) return [trimmed];

  const [, first, rest] = match;
  if (rest.split(/\s+/).length < MIN_REMAINDER_WORDS) return [trimmed];

  return [first, rest];
}
