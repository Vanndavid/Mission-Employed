import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLive, LIVE_URL, LiveHandlers, sumUsage } from './geminiLive';

/**
 * The Live protocol as the probe against the real service found it: the
 * setup message is required even though the token overrides it, typed text
 * must not sit inside an activityStart/activityEnd pair, and history is
 * replayed as clientContent before anything goes live.
 */

class FakeSocket {
  static last: FakeSocket;

  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeSocket.last = this;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  receive(message: unknown, asBlob = false) {
    const text = JSON.stringify(message);
    this.onmessage?.({ data: asBlob ? new Blob([text]) : text });
  }

  drop() {
    this.onclose?.();
  }
}

const handlers = (): LiveHandlers & Record<string, ReturnType<typeof vi.fn>> => ({
  onAudio: vi.fn(),
  onAnswerText: vi.fn(),
  onReplyText: vi.fn(),
  onTurnComplete: vi.fn(),
  onInterrupted: vi.fn(),
  onClose: vi.fn(),
  onUsage: vi.fn(),
});

const connect = (history: { role: 'user' | 'model'; content: string }[] = [], h = handlers()) => {
  const pending = connectLive(
    { token: 'auth_tokens/abc', model: 'models/gemini-3.8-live', history },
    h,
    url => new FakeSocket(url) as unknown as WebSocket,
  );
  FakeSocket.last.open();
  return { pending, h, socket: FakeSocket.last };
};

beforeEach(() => vi.restoreAllMocks());

describe('connectLive', () => {
  it('connects to the constrained endpoint with the token and names the model', async () => {
    const { pending, socket } = connect();

    expect(socket.url).toBe(`${LIVE_URL}?access_token=auth_tokens%2Fabc`);
    // Without this the session never starts, even though the token's own
    // setup replaces everything in it.
    expect(socket.sent).toEqual([{ setup: { model: 'models/gemini-3.8-live' } }]);

    socket.receive({ setupComplete: {} });
    await pending;
  });

  it('replays stored turns before going live', async () => {
    const { pending, socket } = connect([
      { role: 'model', content: 'Tell me about a conflict.' },
      { role: 'user', content: 'I mediated between two teams.' },
    ]);

    socket.receive({ setupComplete: {} });
    await pending;

    expect(socket.sent[1]).toEqual({
      clientContent: {
        turns: [
          { role: 'model', parts: [{ text: 'Tell me about a conflict.' }] },
          { role: 'user', parts: [{ text: 'I mediated between two teams.' }] },
        ],
        turnComplete: true,
      },
    });
  });

  it('sends no history message for a new interview', async () => {
    const { pending, socket } = connect();

    socket.receive({ setupComplete: {} });
    await pending;

    expect(socket.sent).toHaveLength(1);
  });

  it('rejects if the connection closes before setup completes', async () => {
    const { pending, socket } = connect();

    socket.drop();

    await expect(pending).rejects.toThrow();
  });

  it('asks for the opening question as plain text, outside any activity markers', async () => {
    const { pending, socket } = connect();
    socket.receive({ setupComplete: {} });
    const live = await pending;

    live.begin();

    expect(socket.sent.slice(1)).toEqual([{ realtimeInput: { text: 'Begin the interview.' } }]);
  });

  it('wraps a spoken answer in activity markers', async () => {
    const { pending, socket } = connect();
    socket.receive({ setupComplete: {} });
    const live = await pending;

    live.startAnswer();
    live.sendAudio('AAAA');
    live.endAnswer();

    expect(socket.sent.slice(1)).toEqual([
      { realtimeInput: { activityStart: {} } },
      { realtimeInput: { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } } },
      { realtimeInput: { activityEnd: {} } },
    ]);
  });

  it('hands audio, both transcripts and the end of the turn to the handlers', async () => {
    const { pending, socket, h } = connect();
    socket.receive({ setupComplete: {} });
    await pending;

    socket.receive({ serverContent: { inputTranscription: { text: 'I fixed a race.' } } });
    socket.receive({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'QUJD' } }] },
        outputTranscription: { text: 'What lock' },
      },
    });
    // The server sends some frames as binary.
    socket.receive({ serverContent: { outputTranscription: { text: ' did you use?' } } }, true);
    await vi.waitFor(() => expect(h.onReplyText).toHaveBeenCalledTimes(2));
    socket.receive({ serverContent: { turnComplete: true } });
    await vi.waitFor(() => expect(h.onTurnComplete).toHaveBeenCalled());

    expect(h.onAnswerText).toHaveBeenCalledWith('I fixed a race.');
    expect(h.onAudio).toHaveBeenCalledWith('QUJD');
    expect(h.onReplyText).toHaveBeenNthCalledWith(1, 'What lock');
    expect(h.onReplyText).toHaveBeenNthCalledWith(2, ' did you use?');
  });

  it('reports an interruption', async () => {
    const { pending, socket, h } = connect();
    socket.receive({ setupComplete: {} });
    await pending;

    socket.receive({ serverContent: { interrupted: true } });

    await vi.waitFor(() => expect(h.onInterrupted).toHaveBeenCalled());
  });

  it('reports a dropped connection, but not one it closed itself', async () => {
    const first = connect();
    first.socket.receive({ setupComplete: {} });
    (await first.pending).close();
    first.socket.drop();
    expect(first.h.onClose).not.toHaveBeenCalled();
    expect(first.socket.closed).toBe(true);

    const second = connect();
    second.socket.receive({ setupComplete: {} });
    await second.pending;
    second.socket.drop();
    expect(second.h.onClose).toHaveBeenCalled();
  });

  it('hands each turn\'s usage report to the handler', async () => {
    const { pending, socket, h } = connect();
    socket.receive({ setupComplete: {} });
    await pending;

    const usage = { promptTokenCount: 727, responseTokenCount: 147, totalTokenCount: 874 };
    socket.receive({ usageMetadata: usage });

    await vi.waitFor(() => expect(h.onUsage).toHaveBeenCalledWith(usage));
  });
});

describe('sumUsage', () => {
  it('adds counts and merges the per-modality details', () => {
    const total = sumUsage(
      {
        promptTokenCount: 700,
        responseTokenCount: 100,
        totalTokenCount: 800,
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 400 }, { modality: 'AUDIO', tokenCount: 300 }],
        responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 100 }],
      },
      {
        promptTokenCount: 50,
        thoughtsTokenCount: 5,
        totalTokenCount: 55,
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 50 }],
      },
    );

    expect(total).toEqual({
      promptTokenCount: 750,
      responseTokenCount: 100,
      thoughtsTokenCount: 5,
      totalTokenCount: 855,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 400 }, { modality: 'AUDIO', tokenCount: 350 }],
      responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 100 }],
    });
  });

  it('starts from nothing', () => {
    expect(sumUsage(null, { totalTokenCount: 5 })).toEqual({
      promptTokenCount: 0,
      responseTokenCount: 0,
      thoughtsTokenCount: 0,
      totalTokenCount: 5,
      promptTokensDetails: [],
      responseTokensDetails: [],
    });
  });
});
