import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone capture for a spoken answer.
 *
 * Pulled out of the prep room because the screen needs three things the raw
 * MediaRecorder does not give it: an elapsed clock, a live input level so the
 * candidate can see they are actually being heard, and a teardown that runs on
 * unmount. The earlier inline version left the microphone track open if you
 * navigated away mid-recording.
 *
 * The level is kept in a ref rather than state on purpose — it changes every
 * animation frame, and re-rendering the whole screen at 60fps to move one
 * meter is not a trade worth making. The meter reads the ref from its own rAF
 * loop.
 */

export type RecorderStatus = 'idle' | 'recording';

export interface AnswerRecorder {
  status: RecorderStatus;
  /** Whole seconds since `start` resolved. */
  seconds: number;
  /** Smoothed input level, 0–1. Read from an animation loop, never rendered. */
  levelRef: React.RefObject<number>;
  /** Rejects with a message safe to show the user. */
  start: () => Promise<void>;
  /** Ends the take and hands the audio to `onComplete`. */
  stop: () => void;
  /** Ends the take and throws the audio away. */
  cancel: () => void;
}

export function useAnswerRecorder(onComplete: (audio: Blob) => void): AnswerRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);

  const levelRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);

  // Kept in a ref so `start` never has to be rebuilt when the handler changes,
  // which would restart the effect that tears the microphone down.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const releaseHardware = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    // A closed context cannot be closed again; a failure here is not worth
    // surfacing, the tracks are already stopped.
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    levelRef.current = 0;
  }, []);

  /**
   * Drive `levelRef` from the analyser.
   *
   * Missing Web Audio is survivable — the recording still works, the meter
   * just sits flat — so every failure here is swallowed rather than failing
   * the take. jsdom is one such environment.
   */
  const watchLevel = useCallback((stream: MediaStream) => {
    try {
      const context = new AudioContext();
      audioContextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);

      const samples = new Uint8Array(analyser.frequencyBinCount);

      const measure = () => {
        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / samples.length);

        // Speech sits well below full scale, so the meter is scaled to make
        // normal talking read as roughly two thirds full, then smoothed so it
        // reads as a voice rather than a strobe.
        const scaled = Math.min(1, rms * 3);
        levelRef.current = levelRef.current * 0.7 + scaled * 0.3;

        frameRef.current = requestAnimationFrame(measure);
      };

      frameRef.current = requestAnimationFrame(measure);
    } catch {
      levelRef.current = 0;
    }
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error('Microphone access is required to record an answer.');
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('This browser cannot record audio.');
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;

    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      recorderRef.current = null;

      releaseHardware();
      setStatus('idle');

      if (!discardRef.current && chunks.length) {
        onCompleteRef.current(new Blob(chunks, { type: 'audio/webm' }));
      }
    };

    recorder.start();
    watchLevel(stream);

    setSeconds(0);
    setStatus('recording');
    tickRef.current = setInterval(() => setSeconds(previous => previous + 1), 1000);
  }, [releaseHardware, watchLevel]);

  const finish = useCallback(
    (discard: boolean) => {
      discardRef.current = discard;

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        return;
      }

      // No live recorder to fire `onstop`; unwind by hand so a stray stop
      // cannot leave the screen stuck in the recording state.
      recorderRef.current = null;
      releaseHardware();
      setStatus('idle');
    },
    [releaseHardware],
  );

  const stop = useCallback(() => finish(false), [finish]);
  const cancel = useCallback(() => finish(true), [finish]);

  useEffect(
    () => () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      recorderRef.current = null;
      releaseHardware();
    },
    [releaseHardware],
  );

  return { status, seconds, levelRef, start, stop, cancel };
}
