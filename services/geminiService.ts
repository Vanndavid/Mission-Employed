
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateCodingProblem(difficulty: 'easy' | 'medium') {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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

export async function evaluateSolution(problemTitle: string, problemDescription: string, userSolution: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a technical interviewer. Evaluate the following coding solution/strategy for the problem "${problemTitle}".
    Problem Description: ${problemDescription}
    
    User's Solution/Strategy: 
    ${userSolution}
    
    Provide concise, constructive feedback. Identify if the logic is correct, if there are edge cases missed, or if the time/space complexity could be improved. Keep it professional and helpful.`,
  });
  return response.text;
}

export async function generateBehavioralPrompt(theme: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Give me a realistic behavioral interview question for the theme: "${theme}". Keep it brief and professional.`,
  });
  return response.text;
}

export async function analyzeJobDescription(jd: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following job description against these 8 criteria for a "mechanical" job search:
    1. Small-mid company (vs FAANG/Mega-corp)
    2. Not "elite" status (Top-tier R&D, Big Tech)
    3. Backend or Full-stack focus
    4. Business domain (telecom, healthcare, logistics, insurance)
    5. SQL involved
    6. Likely Recruiter-led (not just blind portal)
    7. Focus on Maintenance + incremental build (not 0-to-1 deep tech)
    8. No signals of extreme algorithm-heavy interviews (Leetcode Hard vibes)

    Return a JSON object indicating which are met.
    
    Job Description: ${jd}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criteriaMetIds: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING, description: "Return the IDs matching: small_mid, not_faang, backend_fullstack, business_domain, sql_involved, recruiter_led, maintenance, no_algo_heavy" } 
          },
          reasoning: { type: Type.STRING }
        },
        required: ["criteriaMetIds", "reasoning"],
      }
    }
  });
  return JSON.parse(response.text);
}
