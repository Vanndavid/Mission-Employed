# Mission-Employed — rebuild todo

Migrating off the Express backend to a **Laravel API + React TypeScript client**,
and cutting the app down to four features.

**Branch:** `main` (the `rebuild/laravel-react` work is merged) · **Status:** Waves 0 and 1 done, Wave 2 next

## How to use this file

Every open task below has a **copy-paste brief** — a fenced block you can paste
straight into a fresh `claude` session or agent in this folder. Project context
comes from `CLAUDE.md`, which loads automatically, so the brief only carries what
is specific to that task. Work is test-driven: write the failing test first.
[`.cursor/rules/tdd.mdc`](.cursor/rules/tdd.mdc) is the how-to.

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
   answered with. Already updated: `JobApplications` (five handler prop types, and the
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
- Nothing gates on `loading` yet, so `JobApplications` flashes its empty state during
  the first load. 3.2 should gate on `useApplications().loading`.
- `PremiumGate` still reads `useAuth().isPremium`. A 403 from the API is
  `err.isPremiumRequired` — that is what 3.5 should route to the upgrade prompt.

### 3.2 Tracker screens

- [ ] Not started · needs 3.1

```
Task 3.2 from TASKS.md: wire the tracker screens to the API.

Your lane: frontend/components/JobApplications.tsx, Profile.tsx, CVStudio.tsx,
CoverLetterStudio.tsx, A4Preview.tsx, InterviewStageEditor.tsx,
UpcomingInterviews.tsx, InterviewPrepDrawer.tsx, and frontend/utils/csv.ts.
Other agents hold the other components. Nothing under backend/.

Task 3.1 built the data layer; use it rather than calling fetch directly.
Move the job applications screen, the profile document, and the CV and cover letter studios onto
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

### 3.2a Job applications table — renamed, filterable, sortable, starrable ✅

- [x] Done and deployed, 2026-09-03. The **Pipeline** tab is now **Job
  Applications** (sidebar, page heading, dashboard card;
  `components/Pipeline.tsx` → `components/JobApplications.tsx`, route
  `/applications` unchanged).

The table gained a toolbar — search across company, role, location and next
action; a status dropdown; an "Important only" toggle; and a live "showing n of
m" count — plus sortable Company / Role, Status, Next Action and Date headers.
Status sorts in pipeline order (Saved → Applied → … → Rejected), not
alphabetically, and rows with no date sort last in *both* directions.

Marking important is a new `applications.is_important` boolean, `isImportant`
over the wire, toggled with the star in the first column. Starred rows pin
above the rest whatever the sort column is. Two things worth remembering:

- `StoreApplicationRequest::columns()` has to default `is_important` explicitly,
  the same way it already defaults `status`. The 201 body is serialized from
  the model that was just created, so a column default alone serializes as null.
- The filter and sort rules live in `frontend/utils/applicationTable.ts`, not in
  the component, so they are unit tested without a DOM.

### 3.2b Seek listings on Job Applications ✅

- [x] Done — the Job Applications page has a Seek section that loads live
  listings through `GET /api/seek/jobs`, a Laravel proxy of Seek's own
  `GET /api/jobsearch/v5/search`. Saving a listing creates a `Saved`
  application with the Seek URL, teaser and bullets. Upstream Seek errors
  become a contained 502 (`seek_unavailable`) and never leak the body.
  Tests fake the HTTP client; nothing hits the network.

### 3.2c Spreadsheet import ✅

- [x] Done, 2026-09-22. "Import CSV" is now **Import spreadsheet**: it takes
  `.xlsx`, `.xls` or `.csv`, whatever the columns are called, and whether or not
  the applications are already tracked.

Three steps in `components/ImportApplicationsModal.tsx`: read the file, review
the column mapping, review the rows and commit.

**Parsing is client-side.** There is no upload handling anywhere in Laravel —
no multipart, no `Storage` — and `apiRequest` always `JSON.stringify`s its
body. SheetJS (pinned to the patched 0.20.3 from `cdn.sheetjs.com`, because
npm's newest `xlsx` is 0.18.5 with two unfixed CVEs) reads all three formats
through one path, dynamically imported so it is a separate 500 kB chunk and the
main bundle is untouched. That also killed a real bug: the old hand-rolled
`parseCsvLine` split on newlines *before* parsing quotes, so a quoted notes cell
containing a newline corrupted its row. `utils/csv.ts` is now export-only.

**The AI maps the vocabulary, not the rows.** `POST /api/ai/import/plan` gets the
header row, 8 sample rows and the distinct values of the low-cardinality columns,
and answers with column indices per field plus dictionaries translating the
sheet's own status and channel wording. The client then applies that plan to
every row deterministically. So a 500-row sheet costs the same as a 10-row one,
the same sheet always imports identically, and — because the mapping is a form
with `guessPlan()` as its baseline — a wrong answer costs one dropdown rather
than a sheet full of bad rows. It answers with *indices*, never header text, so
a blank or duplicated header cannot break the join.

**It works with the AI off.** `guessPlan()` maps the sheet from header synonyms
and value shapes, and is both the fallback and the diff baseline. A free user
(403) and an unreachable model (502) both fall through to it with *different*
messages, so a premium user is never told their plan lapsed.

**Committing fills blanks; it never overwrites.** Every row gets a verdict —
`create`, `fill`, `identical`, `invalid` — and `identical` makes no request at
all, which is what makes re-importing the same sheet a no-op. Matching is on
normalised company **and** role, because people apply to one company repeatedly
(the real sheet has three Nexigen applications and two REA Group roles). A
status advances along the pipeline or is left alone, so a stale export cannot
reopen a rejected application.

Things worth remembering:

- All the logic is in `utils/{spreadsheet,importPlan,importRows,importMerge}.ts`
  as pure functions, tested without a DOM, the way `applicationTable.ts` is.
- The commit path must **not** go through `withCreateDefaults`. Its
  `role || 'Software Engineer'` and `dateApplied || today` write values where the
  sheet had blanks, which silently defeats filling them later. `commitImport`
  replaced `importApplications`, which counted failures and discarded every
  reason for them.
- A `fill` uses the **direct** `trackerClient.updateApplication`, not the
  context's own optimistic debounced one — a burst of row patches would coalesce
  and lose writes.
- Backend: a nullable `source` column (free string, not an enum — job boards are
  open-ended), and an optional `statusDate` that backdates the status event.
  `statusDate` is validated but absent from `COLUMN_MAP` because it is not a
  column. The `isDirty('status')` gate in `update()` is load-bearing: without it
  a blank-filling PATCH would log a status event and idempotency would die.
- `Days Since Applied` can reconstruct the many blank dates, but it is a live
  formula whose baseline is whenever the file was last opened, so it is opt-in
  and never replaces a date the sheet has.

### 3.2d Rejection feedback and Insights ✅

- [x] Done, 2026-09-25. Seek's "unlikely to progress" screening questions
  (`rejectionReasons`) are now visible, editable and charted.

- **Drawer:** a "Rejection feedback" section lists each reason with a ✗ and a
  category tag, with add/edit/remove. It saves the whole list through the
  ordinary `updateApplication` patch path, so no backend change was needed. A
  rejected application with no reasons shows only "+ Add rejection feedback".
- **Table:** rejected rows with reasons get an "N flags" badge. Hovering with a
  mouse or tapping it shows the reasons. The popover is `position: fixed`
  because the table clips overflow.
- **Insights tab** (`?tab=insights`, beside "My applications"): summary tiles,
  "Why SEEK screened me out" (one bar per category, clicking a bar lists the
  matching applications and links to `/applications?prep=<id>`), and
  "Rejections over time" (per month, stacked with/without feedback). The
  All time / 3 months / 30 days range applies to everything.
- **No chart library.** The bars are plain Tailwind divs. Two simple bar
  charts did not justify a dependency.
- `categorizeReason()` and all of the aggregation live in
  `frontend/utils/rejectionInsights.ts` as pure functions, unit tested. The
  rules are ordered keyword regexes (first match wins, word boundaries on short
  words). Categories: Right to work, Clearances, Salary, Availability,
  Location, Qualifications, Experience, Other.
- A category counts **applications**, not reasons, so two experience questions
  on one rejection count once. The range filter dates a rejected application by
  its latest Rejected status event and anything else by `dateApplied`.

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

### 3.6 Mock interview over the Gemini Live API ✅

- [x] Done. The browser runs the spoken interview over Gemini Live with a
  Laravel-minted ephemeral token. Measured end to end in headless Chromium, with
  a synthesised answer as the microphone: the interviewer's voice starts
  **1.0 s** after the candidate stops talking (it used to be several seconds of
  TTS). Reload mid-interview resumes and the reconnect replays the history. The
  report reads the transcript stored through `/exchanges`.
  - Server: `GeminiClient::createLiveToken()`, and
    `POST /ai/mock/sessions/{id}/live` / `/exchanges` in `MockInterviewController`.
    `GEMINI_LIVE_MODEL` defaults to `gemini-3.8-live`, so no new `.env` key.
  - Client: `services/geminiLive.ts` (protocol), `utils/pcm.ts` (conversion),
    `utils/liveAudio.ts` (mic via AudioWorklet, scheduled playback),
    `hooks/useLiveInterview.ts` (orchestration), `MockTest.tsx`.
  - Settled by probing the real service, and asserted in `geminiLive.test.ts`:
    `responseModalities` / `speechConfig` go under `generationConfig`. The
    browser must still send `{setup: {model}}`, or nothing starts, but the rest
    of it is ignored: a probe that tried to swap the instruction was overridden.
    Typed `realtimeInput.text` inside `activityStart`/`activityEnd` closes the
    socket with 1007. An empty history needs no `clientContent` at all. There is
    no CSP to update.
  - `splitForSpeech` and `conductMockTurn` were removed from the client, since
    Live replaced them.

Why: the mock interviewer's voice lags its text. `gemini-2.5-flash-preview-tts`
builds a whole clip before answering, and it can only be asked once the turn's
text exists. Commit `bd9a2cf` shortened the wait (first sentence synthesised on
its own, "Preparing voice..." while waiting). Live streams audio as it is
generated, so the lag goes away.

Cost, from the pricing page in September 2026: `gemini-3.8-live` bills
$0.018/min of interviewer audio and $0.005/min of candidate audio, roughly 20
cents for a 20-minute interview against about 10 cents for the current TTS.
Each Live turn bills the context accumulated so far.

Design agreed:

- Laravel mints a single-use **ephemeral token**:
  `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens` with
  `x-goog-api-key`. The token carries a full `bidiGenerateContentSetup` and no
  `fieldMask`: the docs say the connection's own setup message is then ignored,
  so the interviewer instruction and model cannot be changed from the browser.
  Short `expireTime` and `newSessionExpireTime`, `uses: 1`. The API key never
  reaches the browser.
- New route `POST /api/ai/mock/sessions/{session}/live` behind the premium gate
  and `ownedSession()`. It returns the token and the setup, and goes through
  `GeminiClient` (with a `FakeGeminiService` counterpart) so tests never hit the
  network. Upstream errors go through `geminiFailure()` as usual.
- The browser opens
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=...`
  and streams 16 kHz 16-bit PCM from an AudioWorklet. It plays the 24 kHz PCM
  it receives through a scheduled AudioContext queue.
- Push-to-talk stays: `realtimeInputConfig.automaticActivityDetection.disabled`,
  with `activityStart` / `activityEnd` on record / stop, so the interviewer
  never cuts in mid-answer.
- `inputAudioTranscription` and `outputAudioTranscription` are on. Each
  completed exchange is POSTed to Laravel and appended to `ai_messages`, so
  resume and the written report keep working. On resume, the stored transcript
  is replayed with `historyConfig.initialHistoryInClientContent` and
  `clientContent` turns.
- `POST /mock/sessions/{session}/turns` stays: the MCP `mock_interview_turn`
  tool uses it. Live is browser-only, like the other audio routes. Say so in
  `mcp/README.md`.
- Model id from config (`GEMINI_LIVE_MODEL`, default `gemini-3.8-live`) with a
  default, so no new required key in the server `.env`.

Unverified, and to be checked with one real call before building on it:

- whether `responseModalities` and `speechConfig` sit under `generationConfig`
  in `BidiGenerateContentSetup`. The docs' examples disagree.
- whether the constrained endpoint still wants a setup message from the client.
  If it does, send the same one the server returned.
- nginx CSP, if any, must allow `wss://generativelanguage.googleapis.com`.

## Wave 4 — Close out

Needs Wave 3. **Read the Deployment section below before starting any of these** —
the app is live at mission-employed.vanndavidteng.com and Express is what
currently serves it.

### 4.1 Laravel production image and nginx cutover

- [x] Done — `Dockerfile.laravel` (FrankenPHP, php 8.3), a `laravel` compose
  service on its own `laravel_data` volume, and `nginx.conf` `/api/` repointed
  from `api:3001` to `laravel:8080`. `/ai/` still points at Express and is now
  dead traffic: the client sends AI calls to `/api/ai/...`, because `API_BASE`
  is `/api`.
- [x] **Deployed and confirmed serving traffic, 2026-09-02.** Laravel answers
  `/api/` at mission-employed.vanndavidteng.com. This unblocks 4.2.

Two things had to be fixed to make the cutover survive contact with the server,
both of which the local build could not have shown:

- **Nothing created an admin.** Registration only ever produces a free `user`,
  and an admin is the only role that can upgrade a plan, so the first boot came
  up with an empty database and nobody able to administer it. The Express
  server reconciled a bootstrap admin from the environment on every boot
  (9ada28e); `php artisan admin:bootstrap` now does the same, and the container
  entrypoint runs it after `migrate`. It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD`,
  which the deployment `.env` already had, and is a no-op when either is unset.
  It is a command and not a seeder because `DatabaseSeeder` also inserts demo
  applications and a second fake user.
- **Unauthenticated API calls answered 500.** Laravel's default
  `redirectGuestsTo(fn () => route('login'))` runs inside the `auth`
  middleware, and there is no such route in an API-only app. The client always
  sends `Accept: application/json` so the app itself worked, but any other
  caller got a 500 where a 401 belongs. Fixed in `bootstrap/app.php`; the suite
  had missed it because every assertion used `getJson`.

The deployment `.env` is not in git and was missing everything Laravel needs.
`APP_KEY` was generated on the server, and `APP_URL`, `FRONTEND_URL`,
`SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`, `BCRYPT_ROUNDS` and
`LOG_LEVEL` were added. `GEMINI_MODEL` is pinned there to `gemini-2.0-flash`,
the model the Express backend had been serving — see the open question below.

**Open question — the Gemini model.** There is an uncommitted change in the
working tree bumping the default from `gemini-2.0-flash` to `gemini-3.7-flash`
in `GeminiService`, `config/services.php` and `.env.example`. It was left
uncommitted and is *not* deployed, because the model name could not be verified
against the API. Production is pinned to the known-good value in `.env`, so
adopting the newer model is a one-line env change plus a restart once someone
confirms the name is real.

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

### 4.3 Test coverage pass ✅

- [x] Done — `AiPremiumGateTest` walks every AI route as a free user (403 +
  `premium_required`, Gemini never called). Remaining FormRequest 422s
  (behavioral theme, document jobDescription/cv) and session-message Gemini
  containment (exact JSON, no upstream body). `Tests\TestCase` now
  `preventStrayRequests()` by default. Frontend: `http.ts` contract tests and
  `PremiumGate`. CI runs `tsc --noEmit`.

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

- [x] **CI half** — `.github/workflows/ci.yml` already ran PHPUnit, Vitest and
  the frontend build from a clean checkout; it now also runs `npx tsc --noEmit`.
- [ ] **Live walk still outstanding** — boot `./dev.sh` as free and premium,
  exercise all four features, hard-refresh mid-conversation. Needs a Gemini
  key; not part of the TDD plumbing PR.

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

### 4.5 Deploy on push to main ✅

- [x] Done. The `deploy` job in `ci.yml` needs the frontend, backend and (new)
  mcp jobs, then SSHes to the server with a key that `authorized_keys` pins to
  `scripts/deploy.sh`. The script fast-forwards, checks the compose config,
  builds before replacing containers, health-checks three URLs and rolls back
  on failure. The design and the operating notes are in `DEPLOYMENT.md`.
- The GitHub Pages copy of the SPA (`deploy.yml`, `build:pages`, the Vite base
  path and router basename) was removed. It had no backend, so nothing
  worked on it.

### 4.6 Uptime monitoring ✅

- [x] Done. `uptime.yml` runs `scripts/uptime-check.sh` every 10 minutes
  against the SPA, `/api/health`, the MCP resource metadata and the TLS expiry.
  It opens one `outage` issue on failure and closes it on recovery.
  `/api/health` now checks SQLite and storage and returns 503 when either
  fails. Laravel logs to stderr in production. See "Monitoring" in
  `DEPLOYMENT.md`. Telescope was considered and rejected: it is a local
  debugging tool that writes every request to the database, and it cannot
  tell you the site is down.

## Wave 5 — MCP server

Independent of the waves above; it only needs the Wave 2 API, which is done.

### 5.1 MCP server over the API ✅

- [x] Done — `mcp/`, a stdio (and optional Streamable HTTP) MCP server wrapping
  the Laravel API in 28 tools: the tracker, interview stages, the CV profile,
  practice history, and the premium AI features. Sign-in is either
  `MISSION_EMPLOYED_TOKEN` or the `login` tool, whose token is stored at
  `~/.config/mission-employed/token` with `0600`. 10 tests against a fake API,
  plus a manual end-to-end run against `php artisan serve`.

Three decisions worth remembering:

- **It is a thin client.** No rule is reimplemented — ownership, validation, the
  status timeline and the premium gate stay in Laravel. The tools only reshape
  input and make failures readable. A 404 is reported with one generic sentence
  rather than Laravel's own body, which names the model class.
- **Audio is not exposed.** `/api/ai/behavioral/evaluate` and `/api/ai/tts` are
  browser-only round trips and have no MCP tool. Mock interviews work through
  the typed-answer path (`MockTurnRequest::typedAnswer()`), which is exactly why
  that fallback exists.
- **Two composite tools** carry the common requests:
  `track_job_from_description` (parse a posting and create the application in
  one call) and the document generators, which take an `applicationId` and pull
  company, role, job description and the base CV from the tracker and profile,
  with `save: true` writing the result back onto the application.

Not done and worth a later pass: `npm install` in `mcp/` crashes npm 10.9.2 when
vitest is a dependency (`Cannot read properties of null (reading 'edgesOut')`,
an arborist peer-resolution bug), so the tests run on `node:test` via `tsx`
rather than the vitest the other packages use.

### 5.2 Remote connector for Claude and Cowork, and email sync ✅

- [x] Done. `node dist/index.js --http` with `MCP_PUBLIC_URL` set is now an
  OAuth 2.1 authorization server (dynamic client registration, PKCE, rotating
  refresh tokens) in front of `/mcp`, so the tracker can be added in Claude or
  Cowork as a custom connector at `https://mission-employed.vanndavidteng.com/mcp`.
  Deployed as the `mcp` compose service (`Dockerfile.mcp`). 26 tests, including
  the full connector flow over real HTTP, plus a manual run against
  `php artisan serve`.

Decisions:

- **Stateless OAuth.** Client ids, codes and tokens are AES-GCM-sealed blobs
  under `MCP_OAUTH_SECRET` (in the server `.env`), so the service has no
  database. The sealed token carries the user's Sanctum token, and every MCP
  request re-checks it with `/api/auth/me`, so revoking the Sanctum token cuts
  the connector off. The one bit of state is the in-memory list of spent codes
  that makes a code single-use. It resets on restart, and codes live 5 minutes.
- **The sign-in page is the MCP server's, not the SPA's.** It posts to Laravel's
  `/api/auth/login` and is rate-limited per IP at 10 failures per 15 minutes,
  because the Laravel login route has no throttle of its own. Worth adding one
  there too at some point.
- **Email is read by the client, not by us.** Claude's Gmail connector reads the
  inbox; this server adds `append_application_note` (idempotent on a `ref` such
  as `gmail:<message id>`) and a `sync_job_emails` prompt with the matching
  rules. No mailbox credential or Google OAuth app is involved.
- nginx resolves `mcp` per request (`resolver 127.0.0.11`), so a broken `mcp`
  container 502s `/mcp` but cannot keep nginx, and so the site, from starting.

---

## Deployment

**The app is live at `mission-employed.vanndavidteng.com`, and a green push to
`main` deploys it automatically** (task 4.5, [`DEPLOYMENT.md`](DEPLOYMENT.md)).

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

**Laravel is the backend for `/api/`, deployed and confirmed on 2026-09-02.**
The Express container is still up but only answers `/ai/`, which nothing calls.
Deleting `server/` is task 4.2, and it is now unblocked.

Deploying is a pull and a rebuild on the server, which is reachable as
`ssh vps` (see `~/.ssh/config`):

```
cd /home/ubuntu/traefik-projects/Mission-Employed
git pull --ff-only origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`.env` there is not in git and holds `APP_KEY`, `GEMINI_API_KEY` and the admin
credentials — never overwrite it from the repo. The SQLite database is on the
`laravel_data` volume and the legacy Express accounts JSON on `api_data`, so a
rebuild keeps both but `docker compose down -v` would destroy them. Backups of
`.env` and the accounts file are in `/root/backups/mission-employed/`.

**Accounts did not migrate.** The Express users lived in a JSON file on the
`api_data` volume and Laravel starts from an empty SQLite database, so everyone
except the bootstrap admin has to register again. The old file is still on the
volume and in the backup directory if those accounts are ever worth porting.

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
