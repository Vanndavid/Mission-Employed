import { useCallback, useEffect, useRef, useState } from 'react';
import { openMockLive, saveMockExchange } from '../services/apiClient';
import { connectLive, LiveConnection, LiveHandlers } from '../services/geminiLive';
import { errorMessage } from '../services/http';
import { createLivePlayer, LivePlayer, Microphone, startMicrophone } from '../utils/liveAudio';

/**
 * The spoken mock interview over Gemini Live.
 *
 * The conversation streams between the browser and Google, so the server only
 * hears about it through {@link saveMockExchange}. Every exchange goes there
 * in order, and a dropped connection reconnects only after the last save has
 * landed, because the reconnect replays whatever the server has.
 *
 * The connection is opened on demand, when an interview begins or an answer
 * starts, rather than held open while the candidate reads. Audio recorded
 * before it is ready is held and sent in order once it is.
 */

export type LiveStatus = 'offline' | 'connecting' | 'ready' | 'recording' | 'thinking' | 'speaking';

export interface LiveExchange {
  answer: string | null;
  reply: string | null;
}

export interface LiveDeps {
  openLive: typeof openMockLive;
  connect: typeof connectLive;
  saveExchange: typeof saveMockExchange;
  startMicrophone: (onChunk: (base64: string) => void) => Promise<Microphone>;
  createPlayer: (onIdle: () => void) => LivePlayer;
}

const defaultDeps: LiveDeps = {
  openLive: openMockLive,
  connect: connectLive,
  saveExchange: saveMockExchange,
  startMicrophone,
  createPlayer: createLivePlayer,
};

const EMPTY_DRAFT = { answer: '', reply: '' };

export function useLiveInterview(sessionId: number | null, deps: LiveDeps = defaultDeps) {
  const [status, setStatus] = useState<LiveStatus>('offline');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [exchanges, setExchanges] = useState<LiveExchange[]>([]);

  const depsRef = useRef(deps);
  depsRef.current = deps;
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const liveRef = useRef<LiveConnection | null>(null);
  const connectingRef = useRef<Promise<void> | null>(null);
  /** Calls waiting for the connection, run in order once it is ready. */
  const outboxRef = useRef<((live: LiveConnection) => void)[]>([]);
  /** Bumped per connection, so a stale one's late events are ignored. */
  const generationRef = useRef(0);
  const savingRef = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(EMPTY_DRAFT);
  const micRef = useRef<Microphone | null>(null);
  const playerRef = useRef<LivePlayer | null>(null);

  const recordingRef = useRef(false);
  /** Between asking for a reply and the interviewer finishing it. */
  const awaitingRef = useRef(false);
  const heardAudioRef = useRef(false);

  const refresh = useCallback(() => {
    const speaking = playerRef.current?.isPlaying() ?? false;
    let next: LiveStatus;
    if (recordingRef.current) next = 'recording';
    else if (!liveRef.current) next = connectingRef.current ? 'connecting' : 'offline';
    else if (awaitingRef.current) next = heardAudioRef.current || speaking ? 'speaking' : 'thinking';
    else next = speaking ? 'speaking' : 'ready';
    setStatus(next);
  }, []);

  const updateDraft = (next: typeof EMPTY_DRAFT) => {
    draftRef.current = next;
    setDraft(next);
  };

  /** Close off whatever has been said since the last exchange and store it. */
  const flushExchange = useCallback(() => {
    const { answer, reply } = draftRef.current;
    updateDraft(EMPTY_DRAFT);

    const exchange = { answer: answer.trim() || null, reply: reply.trim() || null };
    const id = sessionRef.current;
    if ((!exchange.answer && !exchange.reply) || id === null) return;

    setExchanges(previous => [...previous, exchange]);
    savingRef.current = savingRef.current
      .then(() => depsRef.current.saveExchange(id, exchange))
      .catch(() => setError('Part of the interview could not be saved. The report may be missing it.'));
  }, []);

  const stopMicrophone = () => {
    micRef.current?.stop();
    micRef.current = null;
    recordingRef.current = false;
  };

  const withLive = (call: (live: LiveConnection) => void) => {
    if (liveRef.current) call(liveRef.current);
    else outboxRef.current.push(call);
  };

  const ensurePlayer = () => {
    playerRef.current ??= depsRef.current.createPlayer(refresh);
    return playerRef.current;
  };

  const ensureLive = useCallback((): Promise<void> => {
    if (liveRef.current) return Promise.resolve();
    if (connectingRef.current) return connectingRef.current;

    const generation = ++generationRef.current;
    const current = () => generation === generationRef.current;

    const handlers: LiveHandlers = {
      onAudio: audio => {
        if (!current()) return;
        heardAudioRef.current = true;
        ensurePlayer().play(audio);
        refresh();
      },
      onAnswerText: text => {
        if (current()) updateDraft({ ...draftRef.current, answer: draftRef.current.answer + text });
      },
      onReplyText: text => {
        if (current()) updateDraft({ ...draftRef.current, reply: draftRef.current.reply + text });
      },
      onTurnComplete: () => {
        if (!current()) return;
        awaitingRef.current = false;
        flushExchange();
        refresh();
      },
      onInterrupted: () => {
        if (current()) playerRef.current?.stop();
      },
      onClose: () => {
        if (!current()) return;
        liveRef.current = null;
        outboxRef.current = [];
        awaitingRef.current = false;
        stopMicrophone();
        flushExchange();
        refresh();
      },
    };

    const connecting = (async () => {
      // The replay is whatever the server has, so it must have everything.
      await savingRef.current;
      const id = sessionRef.current;
      if (id === null) throw new Error('No interview is open.');

      const ticket = await depsRef.current.openLive(id);
      const live = await depsRef.current.connect(ticket, handlers);
      if (!current()) {
        live.close();
        return;
      }

      liveRef.current = live;
      const waiting = outboxRef.current;
      outboxRef.current = [];
      waiting.forEach(call => call(live));
    })().finally(() => {
      if (current()) connectingRef.current = null;
      refresh();
    });

    connectingRef.current = connecting;
    refresh();
    return connecting;
  }, [flushExchange, refresh]);

  const fail = (cause: unknown) => {
    generationRef.current++;
    connectingRef.current = null;
    outboxRef.current = [];
    awaitingRef.current = false;
    stopMicrophone();
    setError(errorMessage(cause, 'Could not connect to the interviewer.'));
    refresh();
  };

  /**
   * Ask a new interview for its greeting and first question. Takes the id of a
   * session created in the same click, before it has reached this hook's props.
   */
  const begin = useCallback(async (forSession?: number) => {
    if (forSession !== undefined) sessionRef.current = forSession;
    setError(null);
    ensurePlayer();
    awaitingRef.current = true;
    heardAudioRef.current = false;
    withLive(live => live.begin());
    try {
      await ensureLive();
    } catch (cause) {
      fail(cause);
    }
    refresh();
  }, [ensureLive, refresh]);

  const startAnswer = useCallback(async () => {
    setError(null);
    ensurePlayer().stop();
    const connecting = ensureLive();

    // Chunks that arrive before activityStart is queued are held back, so the
    // answer's audio never lands outside its markers.
    let open = false;
    const early: string[] = [];
    try {
      micRef.current = await depsRef.current.startMicrophone(chunk => {
        if (open) withLive(live => live.sendAudio(chunk));
        else early.push(chunk);
      });
    } catch {
      connecting.catch(() => {});
      setError('Microphone access is needed for the mock interview.');
      refresh();
      return;
    }

    recordingRef.current = true;
    withLive(live => live.startAnswer());
    open = true;
    early.forEach(chunk => withLive(live => live.sendAudio(chunk)));
    refresh();

    try {
      await connecting;
    } catch (cause) {
      fail(cause);
    }
  }, [ensureLive, refresh]);

  const endAnswer = useCallback(() => {
    if (!recordingRef.current) return;
    // Stopping flushes the last chunk through the callback, inside the markers.
    stopMicrophone();
    awaitingRef.current = true;
    heardAudioRef.current = false;
    withLive(live => live.endAnswer());
    refresh();
  }, [refresh]);

  /** End the interview's connection. Anything said so far is still saved. */
  const disconnect = useCallback(() => {
    generationRef.current++;
    stopMicrophone();
    flushExchange();
    liveRef.current?.close();
    liveRef.current = null;
    connectingRef.current = null;
    outboxRef.current = [];
    awaitingRef.current = false;
    playerRef.current?.close();
    playerRef.current = null;
    setExchanges([]);
    refresh();
  }, [flushExchange, refresh]);

  /** Resolves once every exchange so far has reached the server. */
  const settled = useCallback(() => savingRef.current, []);

  useEffect(() => () => {
    generationRef.current++;
    micRef.current?.stop();
    liveRef.current?.close();
    playerRef.current?.close();
  }, []);

  return { status, error, draft, exchanges, begin, startAnswer, endAnswer, disconnect, settled };
}
