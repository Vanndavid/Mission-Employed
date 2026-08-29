/**
 * The AI endpoints, all of them behind `auth:sanctum` + the `premium`
 * middleware on the server. A free account gets a 403 with
 * `code: 'premium_required'`, which surfaces as {@link ApiError.isPremiumRequired};
 * a Gemini failure is a 502 with `code: 'ai_unavailable'` and never carries
 * upstream detail.
 *
 * Two shapes changed when these were ported off Express:
 *
 * - **Chat sessions are rows, not a server-side `Map`.** Creating one answers
 *   with the whole session (`id`, `kind`, `context`, `messages`), so a
 *   conversation can be replayed after a refresh instead of starting blank.
 * - **One turn endpoint for every chat kind.** `sendSessionMessage` replaces
 *   the three near-identical per-feature chat routes. Mock interviews keep their own
 *   turn route because they need JSON alongside inline audio.
 */

import { ApiError, apiRequest } from './http';

export { ApiError, errorMessage } from './http';

// --- Session payloads -----------------------------------------------------

export interface AiMessagePayload {
  id: number;
  role: 'user' | 'model';
  content: string;
  sequence: number;
}

export interface AiSessionPayload {
  id: number;
  /** 'coding' | 'mock' | 'cover_letter' | 'cv' */
  kind: string;
  /** Whatever the session was opened with; null when it was opened blank. */
  context: Record<string, unknown> | null;
  messages: AiMessagePayload[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Read a stored session and its transcript back.
 *
 * This is what makes a refresh resume a conversation rather than start one.
 * The Express server held chats in memory, so there was nothing to fetch;
 * `ai_sessions` only helps if the client can find its session again.
 */
export async function fetchSession(sessionId: string | number): Promise<AiSessionPayload> {
  const { session } = await apiRequest<{ session: AiSessionPayload }>(
    `/ai/sessions/${sessionId}`,
  );
  return session;
}

// --- Coding practice ------------------------------------------------------

export interface CodingProblem {
  title: string;
  description: string;
  examples: string[];
  topics: string[];
}

export async function generateCodingProblem(
  difficulty: 'easy' | 'medium' | 'hard',
): Promise<CodingProblem> {
  return apiRequest<CodingProblem>('/ai/coding/problem', {
    method: 'POST',
    body: { difficulty },
  });
}

/**
 * Open a tutor session for a problem. No model call happens here — the first
 * exchange is the student's opening message.
 *
 * `sessionId` is the string form kept for existing call sites; `session`
 * carries the id, the stored context and the transcript so far.
 */
export async function createCodingSession(
  problemTitle: string,
  problemDescription: string,
): Promise<{ session: AiSessionPayload; sessionId: string }> {
  const { session } = await apiRequest<{ session: AiSessionPayload }>('/ai/coding/sessions', {
    method: 'POST',
    body: { problemTitle, problemDescription },
  });

  return { session, sessionId: String(session.id) };
}

/** One turn of any stored chat session. Mock interviews use their own route. */
export async function sendSessionMessage(
  sessionId: string | number,
  message: string,
): Promise<{ text: string; message: AiMessagePayload; reply: AiMessagePayload }> {
  return apiRequest(`/ai/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: { message },
  });
}

/** The tutor's answer to one student message. */
export async function sendCodingChat(
  sessionId: string | number,
  message: string,
): Promise<string> {
  const res = await sendSessionMessage(sessionId, message);
  return res.text;
}

// --- One-question interview practice --------------------------------------

export async function generateBehavioralPrompt(theme: string): Promise<string> {
  const res = await apiRequest<{ text: string }>('/ai/behavioral/prompt', {
    method: 'POST',
    body: { theme },
  });
  return res.text;
}

export async function processAudioResponse(
  audioBase64: string,
  theme: string,
  prompt: string,
  facts: string[] = [],
): Promise<{ transcript: string; feedback: string }> {
  return apiRequest('/ai/behavioral/evaluate', {
    method: 'POST',
    body: {
      audioBase64,
      theme,
      prompt,
      // ConvertEmptyStringsToNull is global middleware on the API, so a blank
      // fact would arrive as null; drop them here instead.
      facts: facts.map(f => f.trim()).filter(Boolean),
    },
  });
}

// --- Full mock interview --------------------------------------------------

export interface MockCompanyContext {
  company?: string;
  role?: string;
  jobDescription?: string;
  facts?: string;
}

/**
 * Open a mock interview. The transcript lives in `ai_messages` from here on,
 * so the session survives a refresh and a server restart — the whole reason
 * the in-memory Express `Map` was retired.
 */
export async function createMockSession(
  companyContext?: MockCompanyContext,
): Promise<AiSessionPayload> {
  const { session } = await apiRequest<{ session: AiSessionPayload }>('/ai/mock/sessions', {
    method: 'POST',
    body: { companyContext: companyContext ?? null },
  });
  return session;
}

/**
 * One interview exchange. Send `audioBase64` for a spoken answer or `answer`
 * for a typed one; the opening turn sends neither and gets the first question.
 */
export async function conductMockTurn(
  sessionId: string | number,
  input: { audioBase64?: string; answer?: string } = {},
): Promise<{ transcript: string; nextPrompt: string }> {
  return apiRequest(`/ai/mock/sessions/${sessionId}/turns`, {
    method: 'POST',
    body: {
      audioBase64: input.audioBase64 ?? null,
      answer: input.answer ?? null,
    },
  });
}

/** Close the interview with a hiring-decision report over the whole transcript. */
export async function generateMockReport(sessionId: string | number): Promise<string> {
  const res = await apiRequest<{ report: string }>(
    `/ai/mock/sessions/${sessionId}/report`,
    { method: 'POST' },
  );
  return res.report;
}

// --- Tracker: paste a job description -------------------------------------

export interface ParsedJobApplication {
  company?: string;
  role?: string;
  location?: string;
  url?: string;
  notes?: string;
  jobDescription?: string;
}

/**
 * The API answers with `null` for any field the model left out. Those become
 * absent keys here so `parsed.notes ?? fallback` still reaches the fallback.
 */
export async function parseJobApplication(text: string): Promise<ParsedJobApplication> {
  const raw = await apiRequest<Record<string, string | null>>('/ai/job/parse', {
    method: 'POST',
    body: { text },
  });

  const parsed: ParsedJobApplication = {};
  for (const key of ['company', 'role', 'location', 'url', 'notes', 'jobDescription'] as const) {
    const value = raw?.[key];
    if (typeof value === 'string' && value !== '') parsed[key] = value;
  }
  return parsed;
}

// --- Tailored documents ---------------------------------------------------

export interface DocumentParams {
  company: string;
  role: string;
  jobDescription: string;
  cv: string;
  template?: string;
  portfolioUrl?: string;
}

export async function generateCoverLetter(params: DocumentParams): Promise<string> {
  const res = await apiRequest<{ text: string }>('/ai/cover-letter/generate', {
    method: 'POST',
    body: params,
  });
  return res.text;
}

export async function generateTailoredCV(params: DocumentParams): Promise<string> {
  const res = await apiRequest<{ text: string }>('/ai/cv/generate', {
    method: 'POST',
    body: params,
  });
  return res.text;
}

/**
 * The refine-chat sessions for a cover letter and a CV have **no route**: they
 * were not in the port list for task 2.3. `AiSession::KINDS` already carries
 * `cover_letter` and `cv`, and `sendSessionMessage` serves any non-mock kind,
 * so bringing them back is one create route on the server plus deleting this
 * guard — nothing else here changes.
 *
 * Failing loudly beats posting at a 404 and reporting it as a server outage.
 */
function refineSessionUnavailable(kind: 'cover letter' | 'CV'): never {
  throw new ApiError(
    501,
    `Refining a ${kind} in chat is not available yet — the session route has not been ported.`,
    'not_implemented',
  );
}

export async function createCoverLetterSession(
  _company: string,
  _role: string,
  _jobDescription: string,
  _currentLetter: string,
): Promise<{ session: AiSessionPayload; sessionId: string }> {
  return refineSessionUnavailable('cover letter');
}

export async function createCVSession(
  _company: string,
  _role: string,
  _jobDescription: string,
  _currentCV: string,
): Promise<{ session: AiSessionPayload; sessionId: string }> {
  return refineSessionUnavailable('CV');
}

/** Works the moment a `cover_letter` session exists — the turn route is shared. */
export async function sendCoverLetterChat(
  sessionId: string | number,
  message: string,
): Promise<string> {
  return sendCodingChat(sessionId, message);
}

/** Works the moment a `cv` session exists — the turn route is shared. */
export async function sendCVChat(
  sessionId: string | number,
  message: string,
): Promise<string> {
  return sendCodingChat(sessionId, message);
}

// --- Spoken playback ------------------------------------------------------

/**
 * The API prepends the 44-byte RIFF header before answering, so the base64 is
 * a complete WAV file. Do not rebuild a header or decode raw PCM on the
 * client — hand it straight to an <audio> element:
 *
 *   new Audio(`data:${TTS_MIME_TYPE};base64,${await textToSpeech(text)}`)
 */
export const TTS_MIME_TYPE = 'audio/wav';

export interface SpeechClip {
  audio: string;
  mimeType: string;
  sampleRate: number;
}

export async function synthesizeSpeech(text: string): Promise<SpeechClip> {
  return apiRequest<SpeechClip>('/ai/tts', { method: 'POST', body: { text } });
}

/** Base64 of a playable WAV file. */
export async function textToSpeech(text: string): Promise<string> {
  const clip = await synthesizeSpeech(text);
  return clip.audio;
}

export { checkHealth } from './authClient';
