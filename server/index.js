import express from 'express';
import cors from 'cors';
import { loadEnvFile } from './loadEnv.js';
import {
  generateCodingProblem,
  createCodingSession,
  sendCodingChat,
  generateBehavioralPrompt,
  textToSpeech,
  conductInterviewTurn,
  processAudioResponse,
  analyzeJobDescription,
  generateSystemDesignPrompt,
  createSystemDesignSession,
  sendSystemDesignChat,
  evaluateSystemDesign,
  generateMockReport,
  parseJobApplication,
  generateCoverLetter,
  createCoverLetterSession,
  sendCoverLetterChat,
  generateTailoredCV,
  createCVSession,
  sendCVChat,
  generateFollowUpEmail,
  generateNegotiationScript,
} from './aiHandlers.js';
import {
  ensureBootstrapAdmin,
  loginUser,
  registerUser,
  requireAdmin,
  requireAuth,
  requirePremium,
} from './auth.js';
import { listUsers, publicUser, updateUserPlan } from './usersStore.js';
import {
  getTalentMe,
  listAdminTalent,
  publicSnapshot,
  setTalentVisibility,
  upsertTalentSnapshot,
} from './talentStore.js';

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const bootstrapAdmin = ensureBootstrapAdmin();
console.log(
  bootstrapAdmin.user
    ? `[auth] bootstrap admin ${bootstrapAdmin.user.email}: ${bootstrapAdmin.action}`
    : `[auth] bootstrap admin ${bootstrapAdmin.action}`
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const result = registerUser({ email: req.body?.email, password: req.body?.password });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const result = loginUser({ email: req.body?.email, password: req.body?.password });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  res.json({ users: listUsers() });
});

app.patch('/api/admin/users/:id/plan', requireAuth, requireAdmin, (req, res) => {
  try {
    const user = updateUserPlan(req.params.id, req.body?.plan);
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.put('/api/talent/snapshot', requireAuth, (req, res) => {
  try {
    const snapshot = upsertTalentSnapshot(req.user.id, req.body?.metrics ?? req.body);
    res.json({ ...getTalentMe(req.user.id), snapshot: publicSnapshot(snapshot) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/talent/me', requireAuth, (req, res) => {
  res.json(getTalentMe(req.user.id));
});

app.patch('/api/talent/visibility', requireAuth, (req, res) => {
  try {
    const snapshot = setTalentVisibility(req.user.id, req.body?.visibleToCompanies);
    res.json({ ...getTalentMe(req.user.id), snapshot: publicSnapshot(snapshot) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/admin/talent', requireAuth, requireAdmin, (_req, res) => {
  res.json({ talents: listAdminTalent() });
});

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch(e => {
      res.status(500).json({ error: e.message });
    });
  };
}

const premiumAi = [requireAuth, requirePremium];

app.post('/ai/coding/problem', ...premiumAi, asyncHandler(async (req, res) => {
  const { difficulty } = req.body;
  const result = await generateCodingProblem(difficulty || 'easy');
  res.json(result);
}));

app.post('/ai/coding/session', ...premiumAi, asyncHandler(async (req, res) => {
  const { problemTitle, problemDescription } = req.body;
  const sessionId = createCodingSession(problemTitle, problemDescription);
  res.json({ sessionId });
}));

app.post('/ai/coding/chat', ...premiumAi, asyncHandler(async (req, res) => {
  const { sessionId, message } = req.body;
  const text = await sendCodingChat(sessionId, message);
  res.json({ text });
}));

app.post('/ai/behavioral/prompt', ...premiumAi, asyncHandler(async (req, res) => {
  const { theme } = req.body;
  const text = await generateBehavioralPrompt(theme);
  res.json({ text });
}));

app.post('/ai/behavioral/evaluate', ...premiumAi, asyncHandler(async (req, res) => {
  const { audioBase64, theme, prompt, facts } = req.body;
  const result = await processAudioResponse(audioBase64, theme, prompt, facts ?? []);
  res.json(result);
}));

app.post('/ai/mock/turn', ...premiumAi, asyncHandler(async (req, res) => {
  const { history, audioBase64, companyContext } = req.body;
  const result = await conductInterviewTurn(history, audioBase64, companyContext);
  res.json(result);
}));

app.post('/ai/mock/report', ...premiumAi, asyncHandler(async (req, res) => {
  const { history, companyContext } = req.body;
  const report = await generateMockReport(history, companyContext);
  res.json({ report });
}));

app.post('/ai/system-design/prompt', ...premiumAi, asyncHandler(async (req, res) => {
  const { topic } = req.body;
  const text = await generateSystemDesignPrompt(topic);
  res.json({ text });
}));

app.post('/ai/system-design/session', ...premiumAi, asyncHandler(async (req, res) => {
  const { topic, scenario } = req.body;
  const sessionId = createSystemDesignSession(topic, scenario);
  res.json({ sessionId });
}));

app.post('/ai/system-design/chat', ...premiumAi, asyncHandler(async (req, res) => {
  const { sessionId, message } = req.body;
  const text = await sendSystemDesignChat(sessionId, message);
  res.json({ text });
}));

app.post('/ai/system-design/evaluate', ...premiumAi, asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  const report = await evaluateSystemDesign(sessionId);
  res.json({ report });
}));

app.post('/ai/job/parse', ...premiumAi, asyncHandler(async (req, res) => {
  const { text } = req.body;
  const result = await parseJobApplication(text);
  res.json(result);
}));

app.post('/ai/cover-letter/generate', ...premiumAi, asyncHandler(async (req, res) => {
  const text = await generateCoverLetter(req.body);
  res.json({ text });
}));

app.post('/ai/cover-letter/session', ...premiumAi, asyncHandler(async (req, res) => {
  const { company, role, jobDescription, currentLetter } = req.body;
  const sessionId = createCoverLetterSession(company, role, jobDescription, currentLetter);
  res.json({ sessionId });
}));

app.post('/ai/cover-letter/chat', ...premiumAi, asyncHandler(async (req, res) => {
  const { sessionId, message } = req.body;
  const text = await sendCoverLetterChat(sessionId, message);
  res.json({ text });
}));

app.post('/ai/cv/generate', ...premiumAi, asyncHandler(async (req, res) => {
  const text = await generateTailoredCV(req.body);
  res.json({ text });
}));

app.post('/ai/cv/session', ...premiumAi, asyncHandler(async (req, res) => {
  const { company, role, jobDescription, currentCV } = req.body;
  const sessionId = createCVSession(company, role, jobDescription, currentCV);
  res.json({ sessionId });
}));

app.post('/ai/cv/chat', ...premiumAi, asyncHandler(async (req, res) => {
  const { sessionId, message } = req.body;
  const text = await sendCVChat(sessionId, message);
  res.json({ text });
}));

app.post('/ai/follow-up/email', ...premiumAi, asyncHandler(async (req, res) => {
  const text = await generateFollowUpEmail(req.body);
  res.json({ text });
}));

app.post('/ai/offer/negotiate', ...premiumAi, asyncHandler(async (req, res) => {
  const text = await generateNegotiationScript(req.body);
  res.json({ text });
}));

app.post('/ai/tts', ...premiumAi, asyncHandler(async (req, res) => {
  const { text } = req.body;
  const audio = await textToSpeech(text);
  res.json({ audio });
}));

app.post('/ai/job/scan', ...premiumAi, asyncHandler(async (req, res) => {
  const { jd, criteria } = req.body;
  const result = await analyzeJobDescription(jd, criteria);
  res.json(result);
}));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`API server on :${PORT}`));
}

export default app;
