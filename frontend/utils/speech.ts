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
