
import { getStoredToken } from './authClient';

const API_BASE = '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let code: string | undefined;
    const raw = await res.text();
    if (raw) {
      try {
        const data = JSON.parse(raw);
        message = data.error || data.message || message;
        code = data.code;
      } catch {
        message = raw;
      }
    }
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.status = res.status;
    err.code = code;
    throw err;
  }
  return res.json();
}

export async function generateCodingProblem(difficulty: 'easy' | 'medium' | 'hard') {
  return post<{ title: string; description: string; examples: string[]; topics: string[] }>('/ai/coding/problem', { difficulty });
}

export async function createCodingSession(problemTitle: string, problemDescription: string) {
  return post<{ sessionId: string }>('/ai/coding/session', { problemTitle, problemDescription });
}

export async function sendCodingChat(sessionId: string, message: string) {
  const res = await post<{ text: string }>('/ai/coding/chat', { sessionId, message });
  return res.text;
}

export async function generateBehavioralPrompt(theme: string) {
  const res = await post<{ text: string }>('/ai/behavioral/prompt', { theme });
  return res.text;
}

export async function textToSpeech(text: string) {
  const res = await post<{ audio: string }>('/ai/tts', { text });
  return res.audio;
}

export async function processAudioResponse(
  audioBase64: string,
  theme: string,
  prompt: string,
  facts: string[] = []
) {
  return post<{ transcript: string; feedback: string }>('/ai/behavioral/evaluate', {
    audioBase64,
    theme,
    prompt,
    facts,
  });
}

export async function conductInterviewTurn(
  history: { role: string; text: string }[],
  audioBase64?: string,
  companyContext?: { company: string; role: string; jobDescription: string; facts: string }
) {
  return post<{ transcript: string; nextPrompt: string }>('/ai/mock/turn', {
    history,
    audioBase64,
    companyContext,
  });
}

export async function generateMockReport(
  history: { role: string; text: string }[],
  companyContext?: { company: string; role: string; jobDescription: string; facts: string }
) {
  const res = await post<{ report: string }>('/ai/mock/report', { history, companyContext });
  return res.report;
}

export async function parseJobApplication(text: string) {
  return post<{
    company: string;
    role: string;
    location?: string;
    url?: string;
    notes?: string;
    jobDescription?: string;
  }>('/ai/job/parse', { text });
}

export async function generateCoverLetter(params: {
  company: string;
  role: string;
  jobDescription: string;
  cv: string;
  template?: string;
  portfolioUrl?: string;
}) {
  const res = await post<{ text: string }>('/ai/cover-letter/generate', params);
  return res.text;
}

export async function createCoverLetterSession(
  company: string,
  role: string,
  jobDescription: string,
  currentLetter: string
) {
  return post<{ sessionId: string }>('/ai/cover-letter/session', {
    company, role, jobDescription, currentLetter,
  });
}

export async function sendCoverLetterChat(sessionId: string, message: string) {
  const res = await post<{ text: string }>('/ai/cover-letter/chat', { sessionId, message });
  return res.text;
}

export async function generateTailoredCV(params: {
  company: string;
  role: string;
  jobDescription: string;
  cv: string;
  template?: string;
  portfolioUrl?: string;
}) {
  const res = await post<{ text: string }>('/ai/cv/generate', params);
  return res.text;
}

export async function createCVSession(
  company: string,
  role: string,
  jobDescription: string,
  currentCV: string
) {
  return post<{ sessionId: string }>('/ai/cv/session', {
    company, role, jobDescription, currentCV,
  });
}

export async function sendCVChat(sessionId: string, message: string) {
  const res = await post<{ text: string }>('/ai/cv/chat', { sessionId, message });
  return res.text;
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}
