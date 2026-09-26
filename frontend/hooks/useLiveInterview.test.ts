import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { LiveDeps, useLiveInterview } from './useLiveInterview';
import type { LiveConnection, LiveHandlers, LiveTicket } from '../services/geminiLive';

/**
 * The spoken interview's orchestration, with the network, the microphone and
 * the speakers faked. What matters here: each exchange reaches the server
 * exactly once, a dropped connection resumes from what the server has, and
 * the status the button shows follows what is actually happening.
 */

let handlers: LiveHandlers;
let connection: Record<keyof LiveConnection, ReturnType<typeof vi.fn>>;
let micChunk: (base64: string) => void;
let micLevel: (level: number) => void;
let playerIdle: () => void;
let playing: boolean;

const ticket: LiveTicket = { token: 't', model: 'models/gemini-3.8-live', history: [] };

const deps = {
  openLive: vi.fn(),
  connect: vi.fn(),
  saveExchange: vi.fn(),
  startMicrophone: vi.fn(),
  createPlayer: vi.fn(),
  micStop: vi.fn(),
  play: vi.fn(),
  playerStop: vi.fn(),
};

const liveDeps = (): LiveDeps => ({
  openLive: deps.openLive,
  connect: deps.connect,
  saveExchange: deps.saveExchange,
  startMicrophone: deps.startMicrophone,
  createPlayer: deps.createPlayer,
});

beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset());
  playing = false;

  connection = {
    begin: vi.fn(),
    startAnswer: vi.fn(),
    sendAudio: vi.fn(),
    endAnswer: vi.fn(),
    close: vi.fn(),
  };

  deps.openLive.mockResolvedValue(ticket);
  deps.connect.mockImplementation(async (_ticket: LiveTicket, h: LiveHandlers) => {
    handlers = h;
    return connection;
  });
  deps.saveExchange.mockResolvedValue(undefined);
  deps.micStop.mockReturnValue({ seconds: 6, level: 0.1 });
  deps.startMicrophone.mockImplementation(async (onChunk: (b: string) => void, onLevel: (l: number) => void) => {
    micChunk = onChunk;
    micLevel = onLevel;
    return { stop: deps.micStop };
  });
  deps.createPlayer.mockImplementation((onIdle: () => void) => {
    playerIdle = onIdle;
    return {
      play: (b: string) => {
        playing = true;
        deps.play(b);
      },
      stop: deps.playerStop,
      isPlaying: () => playing,
      close: vi.fn(),
    };
  });
});

const render = () => renderHook(() => useLiveInterview(12, liveDeps()));

/** The interviewer says `text` and finishes, and the speakers drain. */
const interviewerSays = (text: string) =>
  act(() => {
    handlers.onAudio('QUJD');
    handlers.onReplyText(text);
    handlers.onTurnComplete();
    playing = false;
    playerIdle();
  });

describe('useLiveInterview', () => {
  it('opens a new interview and stores the greeting as its first turn', async () => {
    const { result } = render();

    await act(() => result.current.begin());

    expect(deps.openLive).toHaveBeenCalledWith(12);
    expect(connection.begin).toHaveBeenCalled();
    expect(result.current.status).toBe('thinking');

    act(() => handlers.onAudio('QUJD'));
    expect(deps.play).toHaveBeenCalledWith('QUJD');
    expect(result.current.status).toBe('speaking');

    act(() => handlers.onReplyText('Hello. Tell me '));
    act(() => handlers.onReplyText('about yourself.'));
    expect(result.current.draft.reply).toBe('Hello. Tell me about yourself.');

    await interviewerSays('');

    expect(deps.saveExchange).toHaveBeenCalledWith(12, { answer: null, reply: 'Hello. Tell me about yourself.' });
    expect(result.current.exchanges).toEqual([{ answer: null, reply: 'Hello. Tell me about yourself.' }]);
    expect(result.current.draft).toEqual({ answer: '', reply: '' });
    expect(result.current.status).toBe('ready');
  });

  it('stays speaking until the turn is over and the speakers have drained', async () => {
    const { result } = render();
    await act(() => result.current.begin());

    act(() => handlers.onAudio('QUJD'));
    // A gap between chunks drains the speakers mid-turn.
    act(() => {
      playing = false;
      playerIdle();
    });
    expect(result.current.status).toBe('speaking');

    act(() => handlers.onTurnComplete());
    expect(result.current.status).toBe('ready');
  });

  it('streams a spoken answer between activity markers and stores the exchange', async () => {
    const { result } = render();
    await act(() => result.current.begin());
    await interviewerSays('Tell me about a bug.');

    await act(() => result.current.startAnswer());
    expect(result.current.status).toBe('recording');
    expect(connection.startAnswer).toHaveBeenCalled();

    act(() => micChunk('AAAA'));
    expect(connection.sendAudio).toHaveBeenCalledWith('AAAA');

    act(() => result.current.endAnswer());
    expect(deps.micStop).toHaveBeenCalled();
    expect(connection.endAnswer).toHaveBeenCalled();
    expect(result.current.status).toBe('thinking');

    act(() => handlers.onAnswerText('I fixed a race.'));
    expect(result.current.draft.answer).toBe('I fixed a race.');

    await interviewerSays('Which lock?');

    expect(deps.saveExchange).toHaveBeenLastCalledWith(12, { answer: 'I fixed a race.', reply: 'Which lock?' });
  });

  it('holds audio recorded before the connection is ready and sends it in order', async () => {
    let finishConnecting!: () => void;
    deps.connect.mockImplementation(
      (_t: LiveTicket, h: LiveHandlers) =>
        new Promise(resolve => {
          handlers = h;
          finishConnecting = () => resolve(connection);
        }),
    );

    const { result } = render();

    let answering!: Promise<void>;
    act(() => {
      answering = result.current.startAnswer();
    });
    await waitFor(() => expect(deps.startMicrophone).toHaveBeenCalled());
    act(() => micChunk('AAAA'));
    expect(connection.sendAudio).not.toHaveBeenCalled();

    await act(async () => {
      finishConnecting();
      await answering;
    });

    expect(connection.startAnswer.mock.invocationCallOrder[0]).toBeLessThan(
      connection.sendAudio.mock.invocationCallOrder[0],
    );
    expect(connection.sendAudio).toHaveBeenCalledWith('AAAA');
  });

  it('reconnects after a drop, once the last exchange has been saved', async () => {
    const { result } = render();
    await act(() => result.current.begin());

    let saved!: () => void;
    deps.saveExchange.mockReturnValue(new Promise<void>(resolve => (saved = resolve)));
    await interviewerSays('Tell me about a bug.');

    act(() => handlers.onClose());
    expect(result.current.status).toBe('offline');

    let answering!: Promise<void>;
    act(() => {
      answering = result.current.startAnswer();
    });
    // The replay must include the greeting, so the reconnect waits for it.
    expect(deps.openLive).toHaveBeenCalledTimes(1);

    await act(async () => {
      saved();
      await answering;
    });

    expect(deps.openLive).toHaveBeenCalledTimes(2);
    expect(connection.startAnswer).toHaveBeenCalled();
  });

  it('keeps what was said when the connection drops mid-reply', async () => {
    const { result } = render();
    await act(() => result.current.begin());

    act(() => handlers.onReplyText('Tell me about'));
    await act(async () => handlers.onClose());

    expect(deps.saveExchange).toHaveBeenCalledWith(12, { answer: null, reply: 'Tell me about' });
    expect(result.current.status).toBe('offline');
  });

  it('reports a failed connection and goes back to offline', async () => {
    deps.openLive.mockRejectedValue(new Error('The AI service is unavailable right now.'));
    const { result } = render();

    await act(() => result.current.begin());

    expect(result.current.status).toBe('offline');
    expect(result.current.error).toBe('The AI service is unavailable right now.');
  });

  it('releases the microphone, speakers and connection on disconnect', async () => {
    const { result } = render();
    await act(() => result.current.begin());
    await act(() => result.current.startAnswer());

    act(() => result.current.disconnect());

    expect(deps.micStop).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
    expect(result.current.status).toBe('offline');
  });

  it('drives the level meter from the microphone while recording', async () => {
    const { result } = render();
    await act(() => result.current.begin());
    await interviewerSays('Tell me about a bug.');

    await act(() => result.current.startAnswer());
    act(() => micLevel(0.2));

    expect(result.current.levelRef.current).toBeGreaterThan(0);

    act(() => result.current.endAnswer());
    expect(result.current.levelRef.current).toBe(0);
  });

  it('warns when an answer arrived nearly silent, instead of trusting its transcript', async () => {
    const { result } = render();
    await act(() => result.current.begin());
    await interviewerSays('Tell me about a bug.');

    deps.micStop.mockReturnValue({ seconds: 20, level: 0.001 });
    await act(() => result.current.startAnswer());
    act(() => result.current.endAnswer());

    expect(result.current.error).toMatch(/barely heard you/i);

    // What the transcriber makes of silence is invented, so it is not kept.
    act(() => handlers.onAnswerText("I'm not a robot."));
    expect(result.current.draft.answer).toBe('');
    await interviewerSays('Could you share an example?');
    expect(deps.saveExchange).toHaveBeenLastCalledWith(12, { answer: null, reply: 'Could you share an example?' });
  });

  it('says nothing about a normal answer', async () => {
    const { result } = render();
    await act(() => result.current.begin());
    await interviewerSays('Tell me about a bug.');

    await act(() => result.current.startAnswer());
    act(() => result.current.endAnswer());

    expect(result.current.error).toBeNull();
  });
});
