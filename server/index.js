
import express from 'express';
import cors from 'cors';
import {
  generateCodingProblem,
  createCodingSession,
  sendCodingChat,
  generateBehavioralPrompt,
  textToSpeech,
  conductInterviewTurn,
  processAudioResponse,
  analyzeJobDescription,
} from './aiHandlers.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/ai/coding/problem', async (req, res) => {
  try {
    const { difficulty } = req.body;
    const result = await generateCodingProblem(difficulty || 'easy');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/coding/session', async (req, res) => {
  try {
    const { problemTitle, problemDescription } = req.body;
    const sessionId = createCodingSession(problemTitle, problemDescription);
    res.json({ sessionId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/coding/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const text = await sendCodingChat(sessionId, message);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/behavioral/prompt', async (req, res) => {
  try {
    const { theme } = req.body;
    const text = await generateBehavioralPrompt(theme);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/behavioral/evaluate', async (req, res) => {
  try {
    const { audioBase64, theme, prompt } = req.body;
    const result = await processAudioResponse(audioBase64, theme, prompt);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/mock/turn', async (req, res) => {
  try {
    const { history, audioBase64, companyContext } = req.body;
    const result = await conductInterviewTurn(history, audioBase64, companyContext);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/tts', async (req, res) => {
  try {
    const { text } = req.body;
    const audio = await textToSpeech(text);
    res.json({ audio });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/ai/job/scan', async (req, res) => {
  try {
    const { jd, criteria } = req.body;
    const result = await analyzeJobDescription(jd, criteria);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Phase 2-3 stubs
const notImplemented = (_req, res) => res.status(501).json({ error: 'Not implemented' });
app.post('/ai/job/parse', notImplemented);
app.post('/ai/mock/report', notImplemented);
app.post('/ai/system-design/prompt', notImplemented);
app.post('/ai/system-design/chat', notImplemented);
app.post('/ai/cover-letter/generate', notImplemented);
app.post('/ai/cover-letter/chat', notImplemented);
app.post('/ai/follow-up/email', notImplemented);
app.post('/ai/offer/negotiate', notImplemented);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`API server on :${PORT}`));
}

export default app;
