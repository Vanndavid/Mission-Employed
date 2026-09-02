# Mission-Employed — rebuild todo

Migrating off the Express backend to a **Laravel API + React TypeScript client**,
and cutting the app down to four features.

**Branch:** `main` (the `rebuild/laravel-react` work is merged) · **Status:** Waves 0 and 1 done, Wave 2 next

## How to use this file

Every open task below has a **copy-paste brief** — a fenced block you can paste
straight into a fresh `claude` session or agent in this folder. Project context
comes from `CLAUDE.md`, which loads automatically, so the brief only carries what
is specific to that task.

Tasks in the same wave are independent and can run at the same time. A wave
cannot start until the wave above it is done. Each brief ends by telling the
agent to tick its own box here, so the list stays current.

---

## Wave 0 — Foundation ✅

- [x] **0.1** Split the repo into `backend/` + `frontend/` with `git mv`
- [x] **0.2** Scaffold Laravel 12 + Sanctum bearer tokens, SQLite, CORS, `/api/health`
- [x] **0.3** Repoint the dev proxy to `:8000`, rewrite the README, add `dev.sh`

*61 files moved with rename detection. Fixed `loadEnv(mode, '.', '')`, which
resolved against the shell's working directory instead of the config file.*

## Wave 1 — Groundwork ✅

- [x] **1.1** Database schema — 12 migrations, 9 models, enums, factories, seeder
- [x] **1.1a** `behavioral_answers` table, unique on `(user_id, theme_id)`
- [x] **1.2** Frontend amputation — 26 files gone, `App.tsx` 474 → 267, bundle 391 → 318 kB
- [x] **1.3** `GeminiService` — stateless REST client, `FakeGeminiService`, contained exceptions

*Backend 40 tests / 202 assertions. Frontend 6 tests, `tsc --noEmit` clean.*

---

## Wave 2 — API

Three independent tasks. All need Wave 1.

### 2.1 Auth and admin endpoints ✅

- [x] Done — register/login/logout/me on Sanctum, admin user list and plan
  switch, `premium` and `admin` middleware, 24 feature tests. Fixed a 500 on
  registration: `User::create()` left `role` and `plan` null on the in-memory
  model because those defaults live only in the database.

```
Task 2.1 from TASKS.md: build the auth and admin endpoints.

Your lane: backend/app/Http/Controllers/Auth, backend/app/Http/Requests,
backend/app/Http/Middleware, backend/routes/api.php, backend/tests/Feature/Auth*.
Two other agents may be working in backend/app/Http/Controllers — do not touch
their controllers, and if routes/api.php has changed since you read it, re-read
before writing rather than overwriting.

Build:
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout,
  GET /api/auth/me. Sanctum bearer tokens via createToken. Logout revokes only
  the current token, not all of them.
- GET /api/admin/users and PATCH /api/admin/users/{user}/plan.
- An EnsurePremium middleware registered as `premium`, and an EnsureAdmin as
  `admin`. Premium must match User::isPremium() exactly: premium plan OR admin
  role. Register both in bootstrap/app.php.
- A UserResource so role, plan and createdAt serialize in the shape
  frontend/types/auth.ts expects. Never expose password hashes.

Read server/auth.js first — it is the retired implementation. Match its
validation rules (email required and valid, password minimum 8 characters) and
its duplicate-email behaviour, but use Laravel FormRequests rather than porting
the hand-rolled checks. Do not port its HMAC token scheme; Sanctum replaces it.

Write feature tests that actually prove the boundaries: registration rejects a
duplicate email and a 7-character password; login with a wrong password fails;
/api/auth/me 401s without a token; a free user is refused by the premium
middleware and an admin is allowed through it without a premium plan; a
non-admin gets 403 from both admin routes; a user cannot change their own plan
via the admin endpoint. Use the model factories, and their premium()/admin()
states.

Verify with: cd backend && php artisan test
Report the real output. Then tick the 2.1 box in TASKS.md with a one-line note
of what you built. Do not commit.
```

### 2.2 Tracker API ✅

- [x] Done — applications CRUD with the status event log written in one place,
  nested interview stages, profile, coding history and behavioral answers. All
  `auth:sanctum`, and someone else's record is a 404 rather than a 403. 40
  feature tests.

```
Task 2.2 from TASKS.md: build the job application tracker endpoints.

Your lane: backend/app/Http/Controllers/ApplicationController.php,
InterviewStageController.php, ProfileController.php, CodingAttemptController.php,
BehavioralAnswerController.php, their FormRequests and Resources, and
backend/tests/Feature/Application*, Profile*, Coding*, Behavioral*.
Two other agents may be working in backend/app/Http — do not touch their
controllers, middleware, or tests. If routes/api.php changed since you read it,
re-read before writing rather than overwriting.

Build, all behind auth:sanctum:
- GET|POST /api/applications, GET|PATCH|DELETE /api/applications/{application}
- POST /api/applications/{application}/stages,
  DELETE /api/applications/{application}/stages/{stage}
- GET|PUT /api/profile
- GET|POST /api/coding/attempts
- GET /api/behavioral-answers, PUT /api/behavioral-answers/{themeId}

Three things that will bite you, all recorded in Open questions below:
- Empty strings. The client sends '' for untouched inputs, but date_applied and
  next_action_due are nullable date columns. Normalize '' to null in the
  FormRequest, not in the controller.
- Recruiter contact. Use the Application::recruiter_contact accessor for output
  rather than reading the three columns yourself. On input, accept the nested
  {name,email,linkedin} object the client sends and flatten it.
- Status is stored twice — the current value on applications plus the
  application_status_events log. Any status change must append an event. Do it
  in one place so it cannot drift.

Behavioral answers save through updateOrCreate keyed on (user_id, theme_id) —
edit in place, never accumulate rows. Validate theme_id against
BehavioralAnswer::THEME_IDS.

Ownership is the thing most likely to be got wrong, so test it hardest: every
route must 404 (not 403, do not leak existence) when the record belongs to
another user, including the nested stage routes where the stage exists but its
application belongs to someone else. Also test that a status change appends
exactly one event, that '' dates land as null, and that a recruiter with all
blank fields serializes as null rather than an object of empty strings.

Verify with: cd backend && php artisan test
Report the real output. Then tick the 2.2 box in TASKS.md with a one-line note.
Do not commit.
```

### 2.3 AI endpoints ✅

- [x] Done — 12 routes behind `auth:sanctum` + `premium`, every surviving
  prompt and schema ported verbatim into `App\Services\Ai`, chat sessions in
  `ai_sessions`/`ai_messages` replayed through `GeminiClient::chat()` with a
  40-message window, and 41 feature tests that assert the prompt and schema
  sent, not just the status code.

```
Task 2.3 from TASKS.md: port the AI endpoints from Express to Laravel.

Your lane: backend/app/Http/Controllers/Ai/*, backend/app/Services/Ai/* (prompt
and schema classes), their FormRequests, and backend/tests/Feature/Ai*.
Two other agents may be working in backend/app/Http — do not touch their
controllers, middleware, or tests. Do not modify GeminiService or
FakeGeminiService; they are finished. If routes/api.php changed since you read
it, re-read before writing rather than overwriting.

server/aiHandlers.js is the source of truth for every prompt and schema. Port
the surviving ones verbatim where you can; the wording matters more than the
structure. Build, all behind auth:sanctum + the premium middleware:

- POST /api/ai/coding/problem, POST /api/ai/coding/sessions,
  POST /api/ai/sessions/{session}/messages   (one unified chat turn endpoint)
- POST /api/ai/behavioral/prompt, POST /api/ai/behavioral/evaluate
- POST /api/ai/mock/sessions, POST /api/ai/mock/sessions/{s}/turns,
  POST /api/ai/mock/sessions/{s}/report
- POST /api/ai/job/parse
- POST /api/ai/cover-letter/generate, POST /api/ai/cv/generate
- POST /api/ai/tts

Do NOT port: system design (four handlers), analyzeJobDescription's criteria
scoring, generateFollowUpEmail, generateNegotiationScript. Those features were
deleted. generateMockReport and parseJobApplication do survive.

Sessions live in the ai_sessions and ai_messages tables, replacing the Express
in-memory Map. Each turn: load the session, replay its messages into
GeminiClient::chat(), append both the user turn and the reply with the next
sequence. Sessions are owned — 404 on someone else's.

Five known porting hazards, from the GeminiService work:
- Schemas: the SDK's Type.OBJECT / Type.STRING constants become plain strings
  'OBJECT' / 'STRING' / 'ARRAY' in REST. Mechanical, but easy to miss.
- The old code did `response.text || ''`, which silently turned a safety block
  into a blank assistant message. GeminiService now throws instead, so every
  call site needs a real catch that returns a sensible HTTP error.
- processAudioResponse parsed prose with text.split('###') and a TRANSCRIPT:
  regex. Do not port that string surgery — use generateJsonFromParts with a
  {transcript, feedback} schema.
- TTS returns raw base64 PCM at audio/L16;rate=24000, not a playable file.
  Decide where the WAV/RIFF header gets added and write it down in TASKS.md.
- Every chat turn resends the whole transcript, so tokens grow quadratically
  over a long session. Not a blocker now; note it if you see a cheap cap.

Bind FakeGeminiService in every test — no test may hit the network. Use its
queueJson/queueChat/queueAudio and assertPromptContains to prove the right
prompt and schema were sent, not merely that a 200 came back. Test that a free
user gets refused by the premium gate on at least one AI route, that a session
belonging to another user 404s, and that a GeminiException becomes a clean HTTP
error with no upstream body in the response.

Verify with: cd backend && php artisan test
Report the real output. Then tick the 2.3 box in TASKS.md with a one-line note.
Do not commit.
```

---

## Wave 3 — Client

Needs Wave 2. **3.1 must land before the other four**, which can then run together.

### 3.1 Replace the data layer

- [x] Done — the `localStorage` state blob and `migrateState` are gone; four
  providers under `frontend/contexts/` load from the API on mount, expose
  `loading`/`error`/`saving` and write through, and `App.tsx` owns no domain
  state. `services/http.ts` is the one place errors and the `data` envelope are
  handled.

```
Task 3.1 from TASKS.md: replace the frontend data layer with the Laravel API.

Your lane: frontend/services/*, frontend/contexts/AuthContext.tsx,
frontend/App.tsx, frontend/types.ts, frontend/utils/migrateState.ts.
Nothing under backend/.

Right now App.tsx holds the whole AppState in useState and mirrors it to
localStorage under mission_employed_state. The server is now the source of
truth. Replace it.

- Rewrite services/apiClient.ts and services/authClient.ts against the real
  routes. Read backend/routes/api.php for the actual shapes rather than
  assuming — Wave 2 may have adjusted them.
- Delete the localStorage state blob and utils/migrateState.ts with its test.
  The auth token stays in localStorage under mission_employed_token.
- Introduce a data layer the screens can use: a hook or small context per
  resource (applications, profile, coding attempts, behavioral answers) that
  loads on mount, exposes loading and error state, and writes through to the
  API. Keep it plain React — do not add a data-fetching dependency.
- App.tsx should stop owning domain state entirely.

IDs changed type: applications and interview stages were client-generated
crypto.randomUUID() strings and are now auto-increment integers from the
database. Update types.ts and remove the client-side id generation. Anywhere
the client optimistically created a record with its own id needs to use the
record the server returns instead.

Do not restyle anything. Screens keep working off the same prop shapes wherever
possible so tasks 3.2 to 3.5 stay small.

Verify with: cd frontend && npx tsc --noEmit && npm run build && npm test
Then actually run it: ./dev.sh, register a user, confirm the application list
loads from the API and survives a hard refresh. Report what you saw.
Tick the 3.1 box in TASKS.md with a one-line note. Do not commit.
```

#### Contract notes for 3.2–3.5

Read this before starting any of the other Wave 3 tasks. Everything below is
what actually changed; anything not listed kept its old shape on purpose.

**Where the data lives now**

`frontend/contexts/DataProvider.tsx` mounts four providers inside the
signed-in branch of `App.tsx`, so each one loads with a token in hand and the
whole tree is torn down on logout. Use the hooks rather than `fetch`:

| Hook | Gives you |
| --- | --- |
| `useApplications()` | `applications`, `addApplication`, `updateApplication`, `updateStatus`, `deleteApplication`, `addInterviewStage`, `removeInterviewStage`, `importApplications` |
| `useProfile()` | `profile`, `updateProfile` |
| `useCodingHistory()` | `codingHistory`, `addAttempt` |
| `useBehavioralAnswers()` | `answers`, `updateAnswer` |

All four also expose `loading`, `error`, `saving` and `reload`. `App.tsx` reads
them and passes the same props the screens already took, so a screen can keep
its props or switch to the hook directly — both work.

**Prop shapes that changed, and where**

1. **`JobApplication.id` and `InterviewStage.id` are `number`, not `string`.**
   Client-side id generation is gone; a new record is whatever the API
   answered with. Already updated: `Pipeline` (five handler prop types, and the
   `?prep=` lookup now goes through `Number()`), `InterviewPrepDrawer`
   (`onRemoveStage`), `InterviewStageEditor` (`onRemove`), `UpcomingInterviews`
   (`onSelectApp`), and the `utils/csv.test.ts` fixture.
2. **`AuthUser.id` is `number`** (`types/auth.ts`). `AdminUsersPage` follows:
   `busyId` state and `changePlan`'s first argument. Owned by 3.5.
3. **`AppState` is deleted** from `types.ts`, replaced by `UserProfile` with the
   same six fields. `Profile`'s own props did not change.
4. **`CodingHistoryEntry` gained an optional `id?: number`**, plus a
   `NewCodingAttempt` alias for one that has no row yet. `Dashboard`'s
   `onCodingComplete` prop is unchanged.
5. **New `ApplicationInput`** — `Partial<Omit<JobApplication, 'id' |
   'interviewStages' | 'statusHistory'>>` — is what the write helpers take.

**Service functions that changed**

- `createCodingSession()` now returns `{ session, sessionId }` instead of
  `{ sessionId }`. `Dashboard` compiles unchanged; `session.messages` is there
  so 3.3 can resume a tutor conversation after a refresh instead of starting
  blank.
- `sendCodingChat(sessionId, message)` keeps its signature and posts to the
  unified `/api/ai/sessions/{id}/messages`. `sendSessionMessage()` returns the
  whole `{ text, message, reply }` if you want the stored rows.
- **Mock interviews are session-based.** `conductInterviewTurn(history, …)` and
  `generateMockReport(history, …)` are gone; the replacements are
  `createMockSession(context)`, `conductMockTurn(sessionId, { audioBase64 } |
  { answer })` and `generateMockReport(sessionId)`. `MockTest.tsx` was edited
  the minimum needed to compile and run: it holds a `sessionId`, opens a
  session on start, and takes its opening question from the model's first turn
  (falling back to the old canned line). **3.4 still has to persist the session
  id so a mid-interview refresh resumes** — that is the whole point of the move.
- `textToSpeech(text)` still resolves to a base64 string, but the server now
  prepends the RIFF header, so it is a complete WAV file. Play it as
  `data:audio/wav;base64,…`. **`PrepRoom` and `MockTest` still push it through
  `decodeAudioPCM`, which will now misread the 44-byte header as samples — 3.4
  must fix both.** `TTS_MIME_TYPE` and `synthesizeSpeech()` are exported for it.
- `parseJobApplication()` drops `null` and `''` fields, so
  `parsed.notes ?? nlText` still reaches its fallback.
- `createCoverLetterSession()` / `createCVSession()` **throw** a 501
  `not_implemented` `ApiError`: the refine-chat routes were never ported.
  `sendCoverLetterChat` / `sendCVChat` already point at the shared turn
  endpoint and work the moment a session exists. 3.2 either hides the Refine
  box in both studios or the two create routes get added on the server —
  `AiSession::KINDS` already carries `cover_letter` and `cv`.
- `checkHealth()` moved to `authClient` and is re-exported from `apiClient`;
  `Sidebar` is unchanged.

**Errors — one place, do not reinvent per screen**

`services/http.ts` throws `ApiError` with `status`, `code` and `errors`, plus
`isUnauthorized`, `isPremiumRequired`, `isAdminRequired`, `isAiUnavailable`,
`isNotFound`, `isValidation`, `firstFieldError()`, and a free `errorMessage(e,
fallback)`. A 401 from anywhere calls the handler `AuthContext` registers,
which drops the token and signs the user out — no screen has to notice.

**Gotchas**

- Blank date inputs: `toApplicationPayload` sends `null`, never `''`.
- Behavioral bullets: blanks are stripped before sending, and an all-blank
  theme is **not sent at all**. See Open questions — clearing a theme is
  currently impossible.
- Field edits are debounced 400ms and coalesced per record, so the prep drawer
  is one PATCH instead of one per keystroke. `saving` covers it, and pending
  writes flush on unmount.
- Nothing gates on `loading` yet, so `Pipeline` flashes its empty state during
  the first load. 3.2 should gate on `useApplications().loading`.
- `PremiumGate` still reads `useAuth().isPremium`. A 403 from the API is
  `err.isPremiumRequired` — that is what 3.5 should route to the upgrade prompt.

### 3.2 Tracker screens

- [ ] Not started · needs 3.1

```
Task 3.2 from TASKS.md: wire the tracker screens to the API.

Your lane: frontend/components/Pipeline.tsx, Profile.tsx, CVStudio.tsx,
CoverLetterStudio.tsx, A4Preview.tsx, InterviewStageEditor.tsx,
UpcomingInterviews.tsx, InterviewPrepDrawer.tsx, and frontend/utils/csv.ts.
Other agents hold the other components. Nothing under backend/.

Task 3.1 built the data layer; use it rather than calling fetch directly.
Move Pipeline, the profile document, and the CV and cover letter studios onto
server data: list, create, update, delete applications; add and remove interview
stages; save the profile; generate a tailored CV or cover letter through the AI
endpoints and persist the result on the application.

Watch for: application and stage IDs are integers now, not UUID strings. CSV
import creates records through the API one at a time rather than pushing into
local state. Empty date inputs must send null, not ''.

Every mutation needs a visible loading and error state — the old code assumed
writes could not fail because they were local. They can fail now.

Verify with: cd frontend && npx tsc --noEmit && npm run build && npm test
Then run ./dev.sh and click through it: add an application, add a stage, paste a
job description and parse it, generate a cover letter, refresh, confirm it all
persisted. Report what you saw, including anything that broke.
Tick the 3.2 box in TASKS.md with a one-line note. Do not commit.
```

### 3.3 Coding practice and dashboard ✅

- [x] Done — dashboard slimmed to coding practice, pipeline summary and upcoming
  interviews; tutor wired to the session endpoints with real error handling.
  Not done: restoring an in-progress tutor conversation after a refresh, which
  `fetchSession` now makes possible. Small follow-up.

```
Task 3.3 from TASKS.md: wire coding practice and slim the dashboard.

Your lane: frontend/components/Dashboard.tsx and frontend/utils/codingTopics.ts.
Other agents hold the other components. Nothing under backend/.

Coding attempt history comes from GET /api/coding/attempts and each completed
attempt POSTs back. The AI tutor chat runs through the session endpoints, so a
conversation now survives a refresh — make sure the UI reflects that rather than
starting blank each time.

The dashboard still carries shape from the deleted daily-protocol feature. It
should now show only: recent coding attempts and weak topics, a summary of the
application pipeline, and upcoming interviews. No streaks, no personas, no daily
tasks — those were cut in Wave 1 and must not come back.

Verify with: cd frontend && npx tsc --noEmit && npm run build && npm test
Then run ./dev.sh, generate a coding problem, hold a short tutor conversation,
refresh mid-conversation and confirm it resumes. Report what you saw.
Tick the 3.3 box in TASKS.md with a one-line note. Do not commit.
```

### 3.4 Both interview modes ✅

- [x] Done — TTS double-decoding fixed in both components and the mock session
  now resumes after a refresh via a new `GET /api/ai/sessions/{session}`.
- [x] Follow-up — Training Room (`PrepRoom.tsx`) redesigned as a two-column
  workspace: the fact bank stays on screen and editable beside the drill, and
  is no longer behind the premium gate. The evaluator's Markdown is now parsed
  and rendered as cards (`utils/coachFeedback.ts`, `components/CoachFeedback.tsx`)
  instead of printing literal `###`; recording moved into
  `hooks/useAnswerRecorder.ts` with a clock, a level meter and real teardown.
  Three bugs went with it: the question stayed hidden behind the spinner while
  it was spoken, an evaluation failure inside the `FileReader` callback left the
  screen spinning forever, and roughly fifteen classes had no `dark:` variant.
  `playSpokenClip` now takes an optional `AbortSignal` so starting a recording
  cuts the question off rather than recording it.

```
Task 3.4 from TASKS.md: wire interview practice and the full mock interview.

Your lane: frontend/components/PrepRoom.tsx and MockTest.tsx.
Other agents hold the other components. Nothing under backend/.

PrepRoom is the one-question-at-a-time practice: a behavioral prompt, the user's
answer, AI feedback, and spoken playback. Its STAR bullets now persist through
GET /api/behavioral-answers and PUT /api/behavioral-answers/{themeId}, which
edits in place per theme rather than accumulating.

MockTest is the full multi-turn mock ending in a written report. Its session
lives in ai_sessions now, so it survives a refresh and a server restart — the old
version lost everything because the server held chats in memory.

TTS returns raw base64 PCM at audio/L16;rate=24000, not a playable file. Check
what task 2.3 decided about the WAV header — if the server does not add it, the
client must, before handing the audio to an <audio> element. Whichever end does
it, make sure TASKS.md records the answer.

Verify with: cd frontend && npx tsc --noEmit && npm run build && npm test
Then run ./dev.sh and go through both: answer a behavioral question and confirm
the bullets survive a refresh; run several mock turns, refresh mid-interview,
confirm it resumes, then generate the report. Report what you saw.
Tick the 3.4 box in TASKS.md with a one-line note. Do not commit.
```

### 3.5 Plans end to end

- [ ] Not started · needs 3.1

```
Task 3.5 from TASKS.md: make the free/premium split work end to end.

Your lane: frontend/components/PremiumGate.tsx, AccountPage.tsx,
AdminUsersPage.tsx, AuthScreen.tsx, frontend/types/auth.ts.
Other agents hold the other components. Nothing under backend/.

The client's idea of premium must match the server's exactly — premium plan OR
admin role, the rule in User::isPremium(). Anywhere the client currently decides
on its own, make it read the plan and role the API returns.

PremiumGate should gate the same routes the server's premium middleware gates,
and a 402/403 from the API must surface as the upgrade prompt rather than a raw
error toast. Client-side gating is a courtesy, not the enforcement — never treat
it as the security boundary.

AccountPage shows the current plan and what premium unlocks. AdminUsersPage
lists users and changes a plan through PATCH /api/admin/users/{user}/plan, and
must be invisible and unreachable for non-admins.

There is no payment integration and none is planned — an admin upgrades a user
by hand. Do not build a checkout, pricing page, or trial flow.

Verify with: cd frontend && npx tsc --noEmit && npm run build && npm test
Then run ./dev.sh and test both accounts (see Seeder credentials below): confirm
the free user is blocked from an AI feature and sees the upgrade prompt, then
upgrade them from the admin account and confirm the feature unlocks. Report what
you saw. Tick the 3.5 box in TASKS.md with a one-line note. Do not commit.
```

---

## Wave 4 — Close out

Needs Wave 3. **Read the Deployment section below before starting any of these** —
the app is live at mission-employed.vanndavidteng.com and Express is what
currently serves it.

### 4.1 Laravel production image and nginx cutover

- [x] Done — `Dockerfile.laravel` (FrankenPHP, php 8.3), a `laravel` compose
  service on its own `laravel_data` volume, and `nginx.conf` `/api/` repointed
  from `api:3001` to `laravel:8080`. `/ai/` still points at Express and is now
  dead traffic: the client sends AI calls to `/api/ai/...`, because `API_BASE`
  is `/api`. **Not deployed yet** — the image is built and tested locally only.

```
Task 4.1 from TASKS.md: put Laravel into the deployed stack.

The app is live at mission-employed.vanndavidteng.com, served by docker
compose: an nginx container (Dockerfile) serving the built SPA and proxying
/api/ and /ai/ to an Express container (Dockerfile.api) on :3001. Read the
Deployment section of TASKS.md before you touch anything.

Express is still the production backend. This task adds Laravel alongside it
and moves traffic over. Do NOT delete server/ -- that is task 4.2, and it must
not happen until this one is deployed and confirmed working.

Build:
- Dockerfile.laravel: PHP 8.3-fpm-alpine or php:8.3-cli, composer install
  --no-dev --optimize-autoloader, the pdo_sqlite extension, config/route/view
  caching, and php artisan migrate --force on boot. The SQLite file must live
  on a volume, not in the container layer -- the Express container already does
  this for its JSON store, follow the same pattern.
- A laravel service in docker-compose.yml with its own named volume for the
  database, reading APP_KEY, GEMINI_API_KEY and the rest from .env.
- nginx.conf: repoint location /api/ from the Express container to the Laravel
  one. Keep client_max_body_size 10m -- mock interviews POST base64 audio and
  nginx will 413 before the backend sees it. Keep proxy_read_timeout 300s;
  model calls are slow. Confirm Laravel's own upload limits match.
- Leave the /ai/ location pointing at Express for now; nothing calls it once
  Wave 3 lands, and 4.2 removes it.

There is no user data to migrate: production accounts live in the Express
JSON volume and the plan was always a fresh start on Laravel. If that is wrong,
stop and ask rather than guessing -- confirm before destroying anything.

Verify: docker compose build, then docker compose up and exercise
/api/health, register, login and one AI route against the running stack. If the
Docker daemon is unreachable from your shell, say so plainly rather than
claiming the build passed.

Tick the 4.1 box in TASKS.md and record what the deployed topology now is.
Do not commit.
```

### 4.2 Retire Express

- [ ] Not started · needs 4.1 deployed and confirmed

```
Task 4.2 from TASKS.md: delete the old Express backend.

Do NOT start until 4.1 is deployed and Laravel is confirmed serving production
traffic. Deleting server/ before that takes the live site down.

Delete the server/ directory entirely. Nothing may reference it first — grep the
whole repo, including .github/workflows, dev.sh, README.md and both
package.json files, and clean up every reference you find.

Two things to remove from the frontend while you are there:
- @google/genai is in frontend/package.json but the client no longer calls
  Gemini directly. Drop it and reinstall so the lockfile updates.
- frontend/vite.config.ts defines process.env.API_KEY and
  process.env.GEMINI_API_KEY from the env. Nothing reads them today, so nothing
  is leaking, but the substitution is live and the first component to reference
  that name would ship the key to every browser. Delete the whole define block.
  Confirm afterwards that the built bundle contains no key: build with a dummy
  GEMINI_API_KEY set and grep dist/ for it.

Also remove the Express pieces from the deployment: Dockerfile.api, the api
service and its api_data volume in docker-compose.yml, and the /ai/ location in
nginx.conf. Check .dockerignore for now-dead server/ entries.

Verify with: cd frontend && npm run build && npm test, and
cd backend && php artisan test.
Report the real output plus the result of the bundle grep.
Tick the 4.2 box in TASKS.md. Do not commit.
```

### 4.3 Test coverage pass

- [ ] Not started

```
Task 4.3 from TASKS.md: close the gaps in test coverage.

Read every controller under backend/app/Http/Controllers and check it against
the existing feature tests. Add what is missing, focusing on the boundaries
rather than the happy paths that already pass:

- Every owned resource 404s for another user's record, including nested routes.
- The premium middleware gates every AI route, and admin role passes without a
  premium plan.
- Validation rejects the bad input each FormRequest claims to catch.
- A GeminiException surfaces as a clean HTTP error with no upstream body.
- No test hits the network — FakeGeminiService is bound everywhere.

On the frontend, keep Vitest meaningful for what survives rather than chasing a
number. Do not weaken an assertion to make something pass; if a test fails,
either the code is wrong or the test is, and say which.

Verify with: cd backend && php artisan test, and
cd frontend && npm test && npx tsc --noEmit.
Report the real output and the coverage gaps you found.
Tick the 4.3 box in TASKS.md. Do not commit.
```

### 4.4 CI and a real end-to-end run

- [ ] Not started

```
Task 4.4 from TASKS.md: get CI green and walk the whole app.

Update .github/workflows so one workflow covers both packages: PHP 8.3 with
pdo_sqlite, composer install, php artisan test for the backend; Node with a
frontend/package-lock.json cache, npm ci, tsc --noEmit, build and test for the
frontend. Both jobs must pass from a clean checkout — no committed vendor/,
node_modules/ or database file.

Then boot the pair with ./dev.sh and walk all four features end to end against a
live database, as both a free and a premium user: coding practice with the tutor,
the application tracker including a tailored CV and cover letter, one-question
interview practice, and a full mock interview through to its report. Do a hard
refresh partway through each AI conversation to confirm sessions really do
survive, which was the whole point of moving them out of the Express Map.

Write down what actually worked and what did not. Do not fix large problems
silently — report them and add a task to TASKS.md.
Tick the 4.4 box in TASKS.md. Do not commit.
```

---

## Deployment

**The app is live at `mission-employed.vanndavidteng.com`.** Treat main as
something that gets deployed, not just a branch.

The stack is docker compose behind Traefik:

| Service | Image | Role |
| --- | --- | --- |
| `nginx` | `Dockerfile` | Serves the built SPA, proxies `/api/` and `/ai/` |
| `laravel` | `Dockerfile.laravel` | The Laravel API on `:8080`, SQLite on the `laravel_data` volume |
| `api` | `Dockerfile.api` | Express on `:3001`. Serves only `/ai/`, which nothing calls. Deleted in 4.2 |

`docker-compose.prod.yml` adds the Traefik labels and TLS. `nginx.conf` sets
`client_max_body_size 10m` to match the Express JSON limit — mock interviews POST
base64 audio, and nginx would 413 before the backend ever saw it — and a 300s
read timeout because model calls are slow.

**Laravel is the backend for `/api/` as of task 4.1, but this has not been
deployed.** The live site still runs whatever image was last built there. Until
the cutover is deployed and confirmed, do not delete `server/` — that is 4.2.

Why this mattered: the client has sent every request to `/api/` since commit
3f36616, and Express only implements `/api/health`, `/api/auth/*` and
`/api/admin/users`. Its AI handlers live at `/ai/...`, not `/api/ai/...`. So
deploying `main` against the Express backend gives a site where login works and
the tracker, profile, behavioral answers and every AI feature return 404.

The repo split moved the client into `frontend/`, so `Dockerfile` now copies from
there and `.dockerignore` covers both packages.

The Docker daemon **is** reachable from this WSL shell (29.7.2) — an earlier note
here said otherwise. Task 4.1 was verified by building and running the real
stack: `/api/health`, register, login, `GET`/`PUT /api/behavioral-answers`, the
premium 403 and the sanitised 502 when `GEMINI_API_KEY` is empty, plus the SQLite
volume surviving a container restart. Both through the container directly and
through nginx.

`Dockerfile` and `.dockerignore` both carry comments about keeping
`GEMINI_API_KEY` out of the build context, because `vite.config.ts` inlines it
into the client bundle. Task 4.2 removes that `define` block, which retires the
whole hazard.

---

## Carried over from the old server

Things found in the Express code that are **not** being reproduced as-is.

- **The API key is wired into the client build.** `vite.config.ts` defines
  `process.env.API_KEY` from `GEMINI_API_KEY`. No frontend file reads it today so
  nothing leaks yet, but the substitution is live — the first component to
  reference that name ships the key to every browser. Removed in 4.1.
- **Errors returned raw exception text.** The Express `asyncHandler` sent
  `e.message` straight to the client, so anything the Gemini SDK threw went out
  over the wire. `GeminiException` now keeps upstream detail in `detail()`, never
  in `getMessage()`, and deliberately does not chain the underlying
  `RequestException` — chaining it would let Laravel's debug renderer resurface
  the body being suppressed.
- **CORS accepted every origin.** `app.use(cors())` with no options, on an API
  carrying auth tokens. Now pinned to the known frontend origin.
- **Chat sessions lived in a `Map`.** Held in process memory, dropped on every
  restart, invisible to a second worker. Now in `ai_sessions` / `ai_messages`.
- **A safety block looked like an empty answer.** `response.text || ''` turned a
  blocked generation into a blank assistant message. `GeminiService` throws.

## Open questions

- **IDs changed type** — applications and interview stages were client-generated
  UUID strings, now auto-increment integers. Wave 3 has to account for it.
- **`recruiterContact` was flattened** to three nullable columns, so "no recruiter"
  and "recruiter with blank fields" are indistinguishable in storage. The
  `Application::recruiter_contact` accessor normalizes it, treating blank strings
  as absent. Use it rather than reimplementing the check.
- **`dateApplied` and `nextActionDue` can be `''` on the client** but are nullable
  `date` columns. Normalize in the FormRequest.
- **Status is stored twice** — the current value on `applications` plus the event
  log. Keeping them in sync is a controller concern.
- **`behavioral_answers` is per-user global**, not per-application, matching how
  PrepRoom and MockTest read it.
- ~~**A behavioral theme could not be emptied.**~~ Resolved: `bullets` is now
  `present` rather than `required` so `[]` is accepted, and blank elements are
  dropped rather than rejected — `ConvertEmptyStringsToNull` was turning a blank
  bullet into `null`, which the `string` element rule refused.
- **`@types/react` is not installed**, so every import from `react` and
  `react-dom` is an implicit `any` and `strict` is off in `tsconfig.json`. That
  means `npx tsc --noEmit` checks far less inside components than it looks like
  it does — hook state, props and event handlers are all unchecked. Adding the
  types would be a one-line dependency change but would surface errors across
  most components at once, so it belongs in 4.3 rather than in the middle of a
  wave. Until then, do not read a clean `tsc` as proof a component is sound.
- **The cover letter and CV refine-chat sessions have no create route.** They
  were not in the port list for 2.3. `AiSession::KINDS` already carries
  `cover_letter` and `cv` and the unified turn endpoint serves any non-mock
  kind, so it is one controller action away if 3.2 wants the Refine box back.
  Until then `createCoverLetterSession` / `createCVSession` throw a client-side
  501 rather than posting at a 404.
- **Chat history grows quadratically.** Every turn resends the whole transcript,
  so a long session gets expensive. Not urgent; worth a cap or a summarization
  step eventually.
- **TTS is wrapped server-side.** Gemini returns raw headerless PCM at
  `audio/L16;rate=24000`. Task 2.3 settled the open question: `PcmWavEncoder`
  prepends the 44-byte RIFF header in the API, so `POST /api/ai/tts` answers
  `{ audio, mimeType: 'audio/wav', sampleRate: 24000 }` and task 3.4 can hand
  `audio` straight to an `<audio src="data:audio/wav;base64,…">` with no
  decoder on the client.

## Seeder credentials

`php artisan migrate:fresh --seed` creates an admin on the premium plan and an
ordinary free user. Defaults, overridable in `backend/.env`:

| | Email | Password |
| --- | --- | --- |
| Admin, premium | `admin@mission-employed.test` | `password` |
| User, free | `user@mission-employed.test` | `password` |
