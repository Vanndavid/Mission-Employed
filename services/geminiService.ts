
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

/**
 * Creates a stateful chat session for the coding tutor.
 */
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
      6. If the student asks for a hint, provide one incremental step.
      7. Once they solve it optimally, provide a final "Mission Accomplished" summary.`,
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

export async function evaluateSpeech(theme: string, prompt: string, userText: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a high-stakes executive recruiter. Evaluate the following interview response with zero sugar-coating. Provide a critical, unbiased analysis of the transcription. 
    
    Question Asked: ${prompt}
    User's Response: ${userText}
    
    Structure your feedback exactly like this:
    ### 🎯 Execution Summary
    * [Key takeaways of the response]
    * [Did it actually answer the question?]

    ### ⚖️ Unbiased Critiques
    * [Identify vagueness, lack of STAR structure, or rambling]
    * [Identify missed opportunities for impact]

    ### 🚀 Training Directives
    * [Specific adjustments for the next simulation]`,
  });
  return response.text;
}

export async function analyzeJobDescription(jd: string, criteria: Criteria[]) {
  const criteriaText = criteria.map((c, i) => `${i + 1}. [ID: ${c.id}] ${c.label}`).join('\n');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following job description against these specific evaluation criteria:
    ${criteriaText}

    Determine which of these criteria are met based on the text provided.
    
    Job Description: ${jd}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criteriaMetIds: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING, description: "Return only the IDs of the criteria that are met." } 
          },
          reasoning: { type: Type.STRING, description: "Briefly explain why these criteria were or were not met." }
        },
        required: ["criteriaMetIds", "reasoning"],
      }
    }
  });
  return JSON.parse(response.text);
}
