/**
 * The browser's side of a Gemini Live mock interview.
 *
 * Laravel mints a single-use token with the whole session setup locked in
 * (`POST /api/ai/mock/sessions/{id}/live`), and this speaks the WebSocket
 * protocol with it. The API key never reaches the browser, and the setup this
 * sends is ignored except for the model name, so the interviewer cannot be
 * reconfigured from here.
 *
 * What a probe against the real service established, and the tests assert:
 * - a setup message naming the model is still required, or nothing starts;
 * - typed text must not sit inside activityStart/activityEnd, or the server
 *   closes the socket with 1007 "Precondition check failed";
 * - stored turns are replayed as one clientContent message before going live.
 */

export const LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

const AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';

/** What the opening turn says, so the interviewer greets and asks the first question. */
const BEGIN_PROMPT = 'Begin the interview.';

export interface LiveTurn {
  role: 'user' | 'model';
  content: string;
}

export interface LiveTicket {
  token: string;
  model: string;
  history: LiveTurn[];
}

export interface LiveHandlers {
  /** Base64 16-bit PCM at 24 kHz, a chunk at a time, as it is generated. */
  onAudio(base64: string): void;
  /** A fragment of the candidate's transcribed answer. */
  onAnswerText(text: string): void;
  /** A fragment of the interviewer's transcribed reply. */
  onReplyText(text: string): void;
  /** The interviewer has finished this turn. */
  onTurnComplete(): void;
  /** The interviewer was cut off by the candidate starting to answer. */
  onInterrupted(): void;
  /** The connection ended without {@link LiveConnection.close} being called. */
  onClose(): void;
}

export interface LiveConnection {
  /** Ask for the greeting and first question of a new interview. */
  begin(): void;
  startAnswer(): void;
  sendAudio(base64: string): void;
  endAnswer(): void;
  close(): void;
}

interface ServerMessage {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
}

async function readMessage(data: unknown): Promise<ServerMessage | null> {
  let text: string;
  if (typeof data === 'string') text = data;
  else if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
  else return null;

  try {
    return JSON.parse(text) as ServerMessage;
  } catch {
    return null;
  }
}

/**
 * Open a connection and resolve once it is ready for the interview: setup is
 * complete and any stored turns have been replayed.
 */
export function connectLive(
  ticket: LiveTicket,
  handlers: LiveHandlers,
  createSocket: (url: string) => WebSocket = url => new WebSocket(url),
): Promise<LiveConnection> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(`${LIVE_URL}?access_token=${encodeURIComponent(ticket.token)}`);
    let ready = false;
    let closedByUs = false;

    const send = (message: unknown) => socket.send(JSON.stringify(message));

    const connection: LiveConnection = {
      begin: () => send({ realtimeInput: { text: BEGIN_PROMPT } }),
      startAnswer: () => send({ realtimeInput: { activityStart: {} } }),
      sendAudio: data => send({ realtimeInput: { audio: { data, mimeType: AUDIO_MIME_TYPE } } }),
      endAnswer: () => send({ realtimeInput: { activityEnd: {} } }),
      close: () => {
        closedByUs = true;
        socket.close();
      },
    };

    socket.onopen = () => send({ setup: { model: ticket.model } });

    socket.onclose = event => {
      if (closedByUs) return;
      // The close code says why (1007 is a rejected message, 1011 a server
      // fault), so keep it where a user reporting a problem can find it.
      console.warn(`Interview connection closed: ${event?.code ?? '?'} ${event?.reason ?? ''}`.trim());
      if (!ready) reject(new Error('The interview connection closed before it was ready.'));
      else handlers.onClose();
    };

    socket.onmessage = async event => {
      const message = await readMessage(event.data);
      if (!message) return;

      if (message.setupComplete !== undefined) {
        if (ticket.history.length > 0) {
          send({
            clientContent: {
              turns: ticket.history.map(turn => ({ role: turn.role, parts: [{ text: turn.content }] })),
              turnComplete: true,
            },
          });
        }
        ready = true;
        resolve(connection);
        return;
      }

      const content = message.serverContent;
      if (!content) return;

      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) handlers.onAudio(part.inlineData.data);
      }
      if (content.inputTranscription?.text) handlers.onAnswerText(content.inputTranscription.text);
      if (content.outputTranscription?.text) handlers.onReplyText(content.outputTranscription.text);
      if (content.interrupted) handlers.onInterrupted();
      if (content.turnComplete) handlers.onTurnComplete();
    };
  });
}
