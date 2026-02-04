
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Criteria } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateCodingProblem(difficulty: 'easy' | 'medium') {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Generate a programming problem for interview practice. 
    Difficulty: ${difficulty}. 
    Topics: Arrays, Strings, Hash Maps, or SQL logic. 
    Format: Return as JSON with title, description, and examples.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "description", "examples"],
      },
    },
  });
  return JSON.parse(response.text);
}

export function startCodingTutorSession(problemTitle: string, problemDescription: string) {
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are a world-class technical interviewer and mentor. 
      Your goal is to guide the student to solve the problem: "${problemTitle}".
      Problem Description: ${problemDescription}
      
      RULES:
      1. Do NOT give the full solution immediately.
      2. If the student is stuck, provide a small hint or ask a Socratic question to guide their thinking.
      3. Evaluate code for time/space complexity.
      4. Be rigorous but encouraging.
      5. Use Markdown for code blocks.
      6. Once they solve it optimally, provide a final "Mission Accomplished" summary.`,
    },
  });
}

export async function generateBehavioralPrompt(theme: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Give me a realistic behavioral interview question for the theme: "${theme}". Keep it brief and professional.`,
  });
  return response.text;
}

export async function textToSpeech(text: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
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

/**
 * High-fidelity Audio Processing:
 * Transcribes and evaluates recorded audio files in one pass for better stability.
 */
export async function processAudioResponse(audioBase64: string, theme: string, prompt: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        inlineData: {
          mimeType: "audio/webm",
          data: audioBase64
        }
      },
      {
        text: `You are a Lead Recruiter. 
        1. Transcribe the user's spoken answer to the behavioral question: "${prompt}" (Theme: ${theme}).
        2. Provide a critical, professional evaluation of the response.
        
        Return the response in this exact format:
        TRANSCRIPT: [Full accurate transcription]
        
        ### 🎯 Execution Summary
        * [Key takeaways]
        
        ### ⚖️ Unbiased Critiques
        * [Critique lack of STAR, rambling, or missed impact]
        
        ### 🚀 Training Directives
        * [Specific adjustments]`
      }
    ]
  });
  
  const text = response.text;
  const parts = text.split('###');
  const transcriptMatch = text.match(/TRANSCRIPT:([\s\S]*?)###/);
  const transcript = transcriptMatch ? transcriptMatch[1].trim() : "Transcription failed.";
  const feedback = parts.slice(1).map(p => '###' + p).join('\n');
  
  return { transcript, feedback };
}

export async function evaluateSpeech(theme: string, prompt: string, userText: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Evaluate the following interview response. 
    Question: ${prompt}
    User Text: ${userText}
    
    Structure your feedback exactly like this:
    ### 🎯 Execution Summary
    * [takeaways]
    ### ⚖️ Unbiased Critiques
    * [critiques]
    ### 🚀 Training Directives
    * [adjustments]`,
  });
  return response.text;
}

export async function evaluateFullMockInterview(results: { theme: string, prompt: string, response: string }[]) {
  const sessionText = results.map((r, i) => `
  [Question ${i+1}: ${r.theme}]
  Prompt: ${r.prompt}
  Candidate Response: ${r.response}
  `).join('\n---\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this full behavioral mock interview transcript.
    ${sessionText}
    
    Structure your report with:
    1. **FINAL VERDICT** (Hire / No Hire)
    2. **NARRATIVE CONSISTENCY**
    3. **CRITICAL GAPS**
    4. **ELITE ADJUSTMENTS**`,
  });
  return response.text;
}

export async function analyzeJobDescription(jd: string, criteria: Criteria[]) {
  const criteriaText = criteria.map((c, i) => `${i + 1}. [ID: ${c.id}] ${c.label}`).join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze JD against criteria:\n${criteriaText}\n\nJD: ${jd}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criteriaMetIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING }
        },
        required: ["criteriaMetIds", "reasoning"],
      }
    }
  });
  return JSON.parse(response.text);
}
