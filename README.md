# ONE PARTNER — Mission: Employed

A local-first job hunt execution system for software engineers who treat the search as a mechanical process, not an emotional one. Daily protocols, AI-powered prep, pipeline CRM, and cold analytics — all in one dashboard.

**Brand:** ONE PARTNER · **Codename:** Mission: Employed

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### 1. Install dependencies

```bash
npm install
cd server && npm install && cd ..
```

### 2. Configure the AI backend

```bash
cp .env.example server/.env
# Edit server/.env and set:
#   GEMINI_API_KEY
#   AUTH_SECRET (long random string)
#   ADMIN_EMAIL / ADMIN_PASSWORD (bootstrap admin account)
```

### 3. Run development

Terminal 1 — API server (proxied by Vite):

```bash
cd server && npm start
```

Terminal 2 — Frontend:

```bash
npm run dev
```

Open `http://localhost:5173` (or the Vite port shown). Sign up for a **Free** account, or log in with the bootstrap admin. The sidebar shows **AI online** when the backend is reachable.

### 4. Production build

```bash
npm run build
npm run preview
```

---

## Accounts & Premium

| Plan | Access |
|------|--------|
| **Free** | Full hunt system (pipeline, protocol, contacts, analytics, docs). AI coaching locked. |
| **Premium** | Unlocks all `/ai/*` coaching (coding tutor, mock interview, job scan, letters, etc.). |
| **Admin** | Always Premium. Can open **Admin → Manage plans** and set any user to Free/Premium. |

New signups are Free. Payment is not wired yet — an admin flips plan status. Users are stored in `server/data/users.json` (gitignored). Hunt data remains in browser `localStorage`.

Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/plan`.

---

## Core Modules

| Module | Route | Purpose |
|--------|-------|---------|
| Mission Control | `/dashboard` | Daily protocol checklist, coding tutor, apps/day tracker |
| Hunt Command Center | `/analytics` | Funnel, streak, protocol completion rate |
| Pipeline | `/applications` | Mechanical applying with AI job scan |
| Contacts | `/applications/contacts` | CRM + follow-up reminders |
| CV & Profile | `/applications/profile` | Frozen documents |
| Offer Tools | `/applications/offers` | Compare & negotiate |
| Training Room | `/prep` | Behavioral drills + system design |
| Mock Test | `/mock` | Conversational interview sim |
| The Codex | `/rules` | Mental guardrails |

---

## Hunt Personas

Choose a persona at onboarding (or via Personas & Criteria):

- **Maintenance SWE** — small-mid, SQL, recruiter-led (default)
- **Big Tech** — adds hard coding problems
- **Startup** — portfolio review task
- **Career Switcher** — double behavioral weight

Each persona sets criteria, target score, daily tasks, and apps/day target.

---

## Data & Backup

All state lives in browser `localStorage` (`mission_employed_state`). Use **Export** / **Import** (bottom-right) for JSON backups. CSV import/export is available in the Pipeline.

---

## AI Stack

The Express proxy in `server/` routes requests to Gemini:

- **Coding tutor** — Socratic problem solving
- **Behavioral prep** — audio transcription + STAR critique
- **Mock interview** — turn-based sim with session debrief
- **System design** — Socratic architecture drills
- **Job scan** — criteria scoring from JD text
- **Cover letters & follow-ups** — draft generation

Models are configured in `server/aiHandlers.js`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest unit tests |
| `cd server && npm start` | Express AI proxy |
| `cd server && npm test` | Server health tests |

---

## Architecture

```
React 19 + Vite 6 + TypeScript
├── components/     UI modules
├── utils/          analytics, migration, CSV
├── services/       apiClient (fetch → Express)
└── server/         Express + Gemini handlers
```

Local-first hunt data in the browser. Accounts (Free / Premium) live on the Express server; admins unlock Premium until payments are added.

---

*Built for those who refuse to wait for luck. Execution is everything.*
