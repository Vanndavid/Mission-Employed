
import { GoogleGenAI, Type, Modality } from '@google/genai';
import crypto from 'crypto';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const chatSessions = new Map();

export async function generateCodingProblem(difficulty) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Generate a programming problem for interview practice.
    Difficulty: ${difficulty}.
    Topics: Arrays, Strings, Hash Maps, Trees, Graphs, SQL, or Dynamic Programming as appropriate.
    Format: Return as JSON with title, description, examples, and topics (array of topic labels).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          examples: { type: Type.ARRAY, items: { type: Type.STRING } },
          topics: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'description', 'examples', 'topics'],
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

export async function processAudioResponse(audioBase64, theme, prompt, facts = []) {
  const factsBlock = facts.length > 0
    ? `\nCandidate's saved facts for this theme (use to check consistency and specificity):\n${facts.map(f => `- ${f}`).join('\n')}\n`
    : '';

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
      {
        text: `You are a Lead Recruiter.
        1. Transcribe the user's spoken answer to: "${prompt}" (Theme: ${theme}).
        2. Provide a critical, professional STAR evaluation.
        3. Cross-reference the answer against the candidate's saved facts. Flag inconsistencies or missed opportunities to cite real examples.
        ${factsBlock}

        Return:
        TRANSCRIPT: [transcription]

        ### 🎯 Execution Summary
        * [takeaways]

        ### ⚖️ Unbiased Critiques
        * [critiques — include fact-consistency check]

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

export async function generateSystemDesignPrompt(topic) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `You are a senior engineer running a system design interview.
    Present a realistic design scenario for: "${topic}".
    Include functional requirements, scale assumptions (users, QPS, data size), and constraints.
    Keep it to 2-3 paragraphs. Do not provide the solution.`,
  });
  return response.text;
}

export function createSystemDesignSession(topic, scenario) {
  const sessionId = crypto.randomUUID();
  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    config: {
      systemInstruction: `You are a Socratic system design interviewer for: "${topic}".
      Scenario: ${scenario}

      RULES:
      1. Do NOT give away the full architecture.
      2. Ask probing questions about requirements, scale, tradeoffs, and failure modes.
      3. Challenge vague answers. Push on bottlenecks, consistency, and data modeling.
      4. Be concise — 2-4 sentences per response.`,
    },
  });
  chatSessions.set(sessionId, chat);
  return sessionId;
}

export async function sendSystemDesignChat(sessionId, message) {
  const chat = chatSessions.get(sessionId);
  if (!chat) throw new Error('Session not found');
  const response = await chat.sendMessage({ message });
  return response.text || '';
}

export async function evaluateSystemDesign(sessionId) {
  const chat = chatSessions.get(sessionId);
  if (!chat) throw new Error('Session not found');
  const response = await chat.sendMessage({
    message: `Provide a final evaluation of the candidate's system design discussion so far.
    Structure your report as:

    ## Requirements Coverage
    [score /10 and notes]

    ## Scale & Performance
    [score /10 and notes]

    ## Tradeoffs & Alternatives
    [score /10 and notes]

    ## Failure Modes & Reliability
    [score /10 and notes]

    ## Critical Gaps
    [bullet list]

    ## Next Study Focus
    [bullet list]`,
  });
  return response.text || '';
}

export async function generateMockReport(history, companyContext) {
  const historyText = history
    .map(h => `${h.role === 'candidate' ? 'Candidate' : 'Interviewer'}: ${h.text}`)
    .join('\n');
  const contextBlock = companyContext
    ? `\nCompany: ${companyContext.company}\nRole: ${companyContext.role}\nJD: ${companyContext.jobDescription}\nFacts: ${companyContext.facts}\n`
    : '';

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Analyze this behavioral mock interview transcript and produce a hiring decision report.
    ${contextBlock}

    Transcript:
    ${historyText}

    Structure:
    1. **FINAL VERDICT** (Hire / No Hire / Borderline)
    2. **NARRATIVE CONSISTENCY** (did answers align with stated facts?)
    3. **CRITICAL GAPS** (STAR holes, vagueness, missing metrics)
    4. **STRENGTHS**
    5. **ELITE ADJUSTMENTS** (specific improvements before real interview)`,
  });
  return response.text;
}
