import { base64ToFloat32, downsampleToPcm16, int16ToBase64, LIVE_INPUT_RATE, LIVE_OUTPUT_RATE, rms } from './pcm';

/**
 * Microphone in and speaker out for the Gemini Live mock interview. Deliberately
 * thin: the sample conversion lives in `pcm.ts`, where it is tested, and what is
 * left here is Web Audio plumbing that only a real browser can exercise.
 */

/** Send the microphone in chunks of about this long. */
const CHUNK_SECONDS = 0.1;

// Runs on the audio thread and hands each 128-sample frame to the page. Loaded
// from a Blob so it needs no separate file for Vite to bundle.
const TAP_WORKLET = `
class MicTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('mic-tap', MicTap);
`;

/** How long a take ran and how loud it was overall, for spotting a dead microphone. */
export interface MicrophoneTake {
  seconds: number;
  /** Root-mean-square level: about 0.1 for speech, near 0 for silence. */
  level: number;
}

export interface Microphone {
  /** Stop recording, send whatever is still buffered, and release the device. */
  stop(): MicrophoneTake;
}

/**
 * Capture at 16 kHz where the browser allows it, so it resamples the device
 * itself. Its default is the output device's rate, and a Bluetooth headset in
 * call mode drops that to 8 kHz. Firefox refuses to connect a microphone to a
 * context at another rate, so fall back to the device rate there.
 */
function openCapture(stream: MediaStream): { context: AudioContext; source: MediaStreamAudioSourceNode } {
  const context = new AudioContext({ sampleRate: LIVE_INPUT_RATE });
  try {
    return { context, source: context.createMediaStreamSource(stream) };
  } catch {
    void context.close();
    const fallback = new AudioContext();
    return { context: fallback, source: fallback.createMediaStreamSource(stream) };
  }
}

/**
 * Start streaming the microphone as base64 16 kHz 16-bit PCM, reporting the
 * level of each chunk as it goes. Rejects if permission is refused.
 */
export async function startMicrophone(
  onChunk: (base64: string) => void,
  onLevel: (level: number) => void = () => {},
): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  let capture: ReturnType<typeof openCapture>;
  try {
    capture = openCapture(stream);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
  const { context, source } = capture;
  const moduleUrl = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'application/javascript' }));

  try {
    await context.audioWorklet.addModule(moduleUrl);
    // Created after an await, so outside the click: a strict autoplay policy
    // (Safari's) would leave it suspended, and a suspended context captures nothing.
    await context.resume();
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    void context.close();
    throw error;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const tap = new AudioWorkletNode(context, 'mic-tap');
  // A node nobody listens to may never be pulled, so route it to the speakers
  // through a gain of zero.
  const silence = context.createGain();
  silence.gain.value = 0;
  source.connect(tap).connect(silence).connect(context.destination);

  const chunkLength = Math.round(context.sampleRate * CHUNK_SECONDS);
  let pending: Float32Array[] = [];
  let pendingLength = 0;
  let totalSamples = 0;
  let totalSquares = 0;

  const flush = () => {
    if (pendingLength === 0) return;
    const joined = new Float32Array(pendingLength);
    let offset = 0;
    for (const frame of pending) {
      joined.set(frame, offset);
      offset += frame.length;
    }
    pending = [];
    pendingLength = 0;

    const level = rms(joined);
    totalSamples += joined.length;
    totalSquares += level * level * joined.length;
    onLevel(level);
    onChunk(int16ToBase64(downsampleToPcm16(joined, context.sampleRate)));
  };

  tap.port.onmessage = event => {
    const frame = event.data as Float32Array;
    pending.push(frame);
    pendingLength += frame.length;
    if (pendingLength >= chunkLength) flush();
  };

  return {
    stop() {
      tap.port.onmessage = null;
      flush();
      source.disconnect();
      tap.disconnect();
      stream.getTracks().forEach(track => track.stop());
      void context.close();
      return {
        seconds: totalSamples / context.sampleRate,
        level: totalSamples ? Math.sqrt(totalSquares / totalSamples) : 0,
      };
    },
  };
}

export interface LivePlayer {
  /** Queue a chunk of Live's 24 kHz PCM to play straight after the last one. */
  play(base64: string): void;
  /** Cut playback off, as when the candidate starts answering. */
  stop(): void;
  /** Whether anything is playing or queued. */
  isPlaying(): boolean;
  close(): void;
}

/**
 * Play Live's audio as it streams in. Chunks are scheduled back to back on the
 * audio clock so there is no gap between them. Create it from a click, since
 * browsers will not start audio without one.
 */
export function createLivePlayer(onIdle: () => void): LivePlayer {
  const context = new AudioContext({ sampleRate: LIVE_OUTPUT_RATE });
  const playing = new Set<AudioBufferSourceNode>();
  let nextStart = 0;

  return {
    play(base64) {
      const samples = base64ToFloat32(base64);
      if (samples.length === 0) return;
      void context.resume();

      const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_RATE);
      buffer.copyToChannel(samples, 0);

      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);

      nextStart = Math.max(nextStart, context.currentTime);
      node.start(nextStart);
      nextStart += buffer.duration;

      playing.add(node);
      node.onended = () => {
        playing.delete(node);
        if (playing.size === 0) onIdle();
      };
    },
    stop() {
      for (const node of playing) {
        node.onended = null;
        node.stop();
      }
      playing.clear();
      nextStart = 0;
      onIdle();
    },
    isPlaying: () => playing.size > 0,
    close() {
      this.stop();
      void context.close();
    },
  };
}
