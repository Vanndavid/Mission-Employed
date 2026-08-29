import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Coalesce rapid per-key writes into one request each.
 *
 * The screens call their update handlers on every keystroke — that was free
 * when state lived in `useState`, and would be one PATCH per character now.
 * Patches for the same key are merged (`{...previous, ...next}`) and sent once
 * the typing pauses, which also removes the risk of two in-flight writes for
 * the same record landing out of order.
 *
 * A pending patch is flushed on unmount rather than dropped, so navigating
 * away from a half-typed field still saves it.
 *
 * @param flush  Sends one merged patch. It owns its own error handling; a
 *               rejection here is caught and ignored so one bad write cannot
 *               wedge the queue.
 * @param delay  Quiet period before a key is sent, in milliseconds.
 */
export function useDebouncedQueue<P extends object>(
  flush: (key: string, patch: P) => Promise<void>,
  delay = 400,
) {
  const patches = useRef(new Map<string, P>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flushRef = useRef(flush);
  const [pendingCount, setPendingCount] = useState(0);

  // Kept current in an effect rather than during render: a timer only ever
  // fires after at least `delay` ms, by which time this has run.
  useEffect(() => {
    flushRef.current = flush;
  });

  const send = useCallback(async (key: string) => {
    const patch = patches.current.get(key);
    // Both maps are cleared before the first await, so a write queued while
    // this one is in flight starts a fresh patch rather than joining it.
    patches.current.delete(key);
    timers.current.delete(key);
    if (!patch) return;

    try {
      await flushRef.current(key, patch);
    } catch {
      /* flush reports its own failures */
    } finally {
      setPendingCount(count => Math.max(0, count - 1));
    }
  }, []);

  const enqueue = useCallback(
    (key: string, patch: P) => {
      const existing = patches.current.get(key);
      if (!existing) setPendingCount(count => count + 1);
      patches.current.set(key, { ...(existing ?? ({} as P)), ...patch });

      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.set(
        key,
        setTimeout(() => {
          void send(key);
        }, delay),
      );
    },
    [delay, send],
  );

  /** Send everything outstanding now — used before an action that must not race. */
  const flushNow = useCallback(async () => {
    for (const key of [...patches.current.keys()]) {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      await send(key);
    }
  }, [send]);

  useEffect(
    () => () => {
      for (const [key, timer] of timers.current) {
        clearTimeout(timer);
        void send(key);
      }
    },
    [send],
  );

  return { enqueue, flushNow, pending: pendingCount > 0 };
}
