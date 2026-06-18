
import { GoogleGenAI, Type, Modality } from '@google/genai';
import crypto from 'crypto';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const chatSessions = new Map();

export async function generateCodingProblem(difficulty) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Generate a programming problem for interview practice.
    Difficulty: ${difficulty}.
    Topics: Arrays, Strings, Hash Maps, or SQL logic.
    Format: Return as JSON with title, description, and examples.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'description', 'examples'],
      },
    },
  });
  return JSON.parse(response.text);
}

export function createCodingSession(problemTitle, problemDescription) {
  const sessionId = crypto.randomUUID();
  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    config: {
      systemInstruction: `You are a world-class technical interviewer and mentor.
      Your goal is to guide the student to solve the problem: "${problemTitle}".
      Problem Description: ${problemDescription}

      RULES:
      1. Do NOT give the full solution immediately.
      2. If the student is stuck, provide a small hint or ask a Socratic question.
      3. Evaluate code for time/space complexity.
      4. Be rigorous but encouraging.
      5. Use Markdown for code blocks.
      6. Once they solve it optimally, provide a final "Mission Accomplished" summary.`,
    },
  });
  chatSessions.set(sessionId, chat);
  return sessionId;
}

export async function sendCodingChat(sessionId, message) {
  const chat = chatSessions.get(sessionId);
  if (!chat) throw new Error('Session not found');
  const response = await chat.sendMessage({ message });
  return response.text || '';
}

export async function generateBehavioralPrompt(theme) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Give me a realistic behavioral interview question for the theme: "${theme}". Keep it brief and professional.`,
  });
  return response.text;
}

export async function textToSpeech(text) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: `Read this interview question clearly and professionally: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

export async function conductInterviewTurn(history, audioBase64, companyContext) {
  const historyText = history.map(h => `${h.role === 'candidate' ? 'User' : 'Interviewer'}: ${h.text}`).join('\n');
  const contextBlock = companyContext
    ? `\nCompany: ${companyContext.company}\nRole: ${companyContext.role}\nJD: ${companyContext.jobDescription}\nCandidate facts: ${companyContext.facts}\n`
    : '';

  const contents = [];
  if (audioBase64) {
    contents.push({ inlineData: { mimeType: 'audio/webm', data: audioBase64 } });
  }
  contents.push({
    text: `You are a Senior Recruiter conducting a behavioral interview.${contextBlock}
    ${audioBase64 ? 'First, transcribe the user audio.' : ''}

    Interview History:
    ${historyText}

    LOGIC:
    1. Assess the latest answer.
    2. If there is a "big hole" (missing STAR components, vague actions, no clear result), ask a specific follow-up.
    3. If the answer is solid, acknowledge briefly and move to a new topic.

    RESPONSE FORMAT (JSON):
    { "transcript": "...", "nextPrompt": "..." }`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          nextPrompt: { type: Type.STRING },
        },
        required: ['transcript', 'nextPrompt'],
      },
    },
  });
  return JSON.parse(response.text);
}

export async function processAudioResponse(audioBase64, theme, prompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      {
        text: `You are a Lead Recruiter.
        1. Transcribe the user's spoken answer to: "${prompt}" (Theme: ${theme}).
        2. Provide a critical, professional STAR evaluation.

        Return:
        TRANSCRIPT: [transcription]

        ### 🎯 Execution Summary
        * [takeaways]

        ### ⚖️ Unbiased Critiques
        * [critiques]

        ### 🚀 Training Directives
        * [adjustments]`,
      },
    ],
  });

  const text = response.text;
  const parts = text.split('###');
  const transcriptMatch = text.match(/TRANSCRIPT:([\s\S]*?)###/);
  const transcript = transcriptMatch ? transcriptMatch[1].trim() : 'Transcription failed.';
  const feedback = parts.slice(1).map(p => '###' + p).join('\n');
  return { transcript, feedback };
}

export async function analyzeJobDescription(jd, criteria) {
  const criteriaText = criteria.map((c, i) => `${i + 1}. [ID: ${c.id}] ${c.label}`).join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Analyze JD against criteria:\n${criteriaText}\n\nJD: ${jd}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criteriaMetIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING },
        },
        required: ['criteriaMetIds', 'reasoning'],
      },
    },
  });
  return JSON.parse(response.text);
}
