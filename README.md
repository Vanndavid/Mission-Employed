
# MISSION: EMPLOYED 🚀

**Mission: Employed** is a high-performance execution dashboard designed for software engineers who treat the job search as a mechanical process rather than an emotional one. Built on a foundation of disciplined protocols and powered by Google Gemini AI, it removes decision fatigue and replaces it with cold, calculated execution.

---

## 🤖 GEMINI INTEGRATION SPECS

This application is built on the **Gemini 3 ecosystem**, utilizing specialized models for specific operational needs:

*   **Gemini 3 Pro**: Powers the **Coding Tutor** and the **Conversational Role-Play Simulator**. Its high reasoning capability allows it to act as a Socratic mentor and a Senior Recruiter. In the Mock Test, it processes full audio recordings natively to identify "narrative holes" and generate context-aware follow-up questions.
*   **Gemini 3 Flash**: Handles the **AI Job Scan** and **Mechanical Drill Evaluation**. Optimized for speed, it natively transcribes and evaluates spoken audio in the Training Room, providing instant execution summaries and STAR-based critiques.
*   **Native Multimodal Audio**: Instead of fragile real-time streaming, the app uses **High-Fidelity Batch Processing**. Spoken answers are recorded locally and sent as native audio parts directly to Gemini. This allows the models to analyze tone, pacing, and content with significantly higher accuracy than traditional text-only pipelines.
*   **Gemini 2.5 TTS**: Delivers **Professional Interviewer Questions** via audio. By using a prebuilt professional voice, we simulate the high-pressure environment of a real technical screen.

---

## 🛠 CORE OPERATIONAL MODULES

### 1. 🚀 Mission Control (Daily Dashboard)
*   **Protocol Tracking**: A non-negotiable daily checklist covering LeetCode targets, behavioral drills, and interview simulations.
*   **Coding Tutor (Gemini 3 Pro)**: A stateful, AI-powered mentor that provides Socratic guidance on algorithm problems. It won't give you the answer; it will force you to find it.
*   **Persistence Visualizer**: A 28-day heat map and streak tracker. In this search, a broken streak is a failed mission.

### 2. 📁 The Pipeline (Mechanical Applying)
*   **Strict Filtering**: Define custom criteria (e.g., "Not FAANG," "SQL Involved").
*   **Binary Decision Making**: Use the "AI Job Scan" to analyze JDs. If the role scores below your Target Score, the mission is aborted. No exceptions.

### 3. 🧠 Training Room (Behavioral Drill)
*   **The Fact Database**: A repository for your "Raw Truths"—bullets of actual impact, failures, and leadership moments.
*   **Mechanical Execution**: Generate a challenge, listen to the recruiter, and record your response. Gemini 3 Flash will provide a "Recruiter Assessment" including an execution summary and training directives.

### 4. 👔 Role-Play Simulator (Mock Test)
*   **Conversational Logic**: A dedicated turn-based simulation. The AI asks a question and waits.
*   **The "Hole" Detection**: If your answer is vague or lacks a clear Result (from STAR), the AI is programmed to pause the move to the next topic and interrogate the specific gap in your story.

### 5. 📜 The Codex (Mental Guardrails)
*   **Operational Constraints**: A list of "Dont's" to prevent strategy-shifting and procrastination.
*   **Emergency Protocol**: A specialized interface for high-stress periods, providing immediate, tactical steps to reset your mental state.

---

## 🏗 THE 3-PHASE STRATEGY

1.  **Phase 1: Intelligence Gathering**: Fill your Behavioral Database and freeze your CV.
2.  **Phase 2: Mechanical Volume**: Apply to at least 2 roles daily that meet your criteria. 
3.  **Phase 3: Tactical Interviewing**: Use the Simulator to practice handling follow-up pressure and probing questions.

---

## 💻 TECHNICAL ARCHITECTURE

*   **Logic Core**: React 19 with modern ES modules.
*   **Data Strategy**: Local-first storage using `LocalStorage`. Your data stays in your browser.
*   **Audio Pipeline**: Local MediaRecorder API capturing `audio/webm` blobs, processed natively by Gemini 3's multimodal encoders.

*Built for those who refuse to wait for luck. Execution is everything.*
