
import { Criteria } from '../types';

const API_BASE = '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Request failed: ${res.status}`);
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

export async function generateSystemDesignPrompt(topic: string) {
  const res = await post<{ text: string }>('/ai/system-design/prompt', { topic });
  return res.text;
}

export async function createSystemDesignSession(topic: string, scenario: string) {
  return post<{ sessionId: string }>('/ai/system-design/session', { topic, scenario });
}

export async function sendSystemDesignChat(sessionId: string, message: string) {
  const res = await post<{ text: string }>('/ai/system-design/chat', { sessionId, message });
  return res.text;
}

export async function evaluateSystemDesign(sessionId: string) {
  const res = await post<{ report: string }>('/ai/system-design/evaluate', { sessionId });
  return res.report;
}

export async function analyzeJobDescription(jd: string, criteria: Criteria[]) {
  return post<{ criteriaMetIds: string[]; reasoning: string }>('/ai/job/scan', { jd, criteria });
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}
