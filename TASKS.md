# Mission-Employed — task list

**Branch:** `main` · **Status:** rebuild complete; project parked 2026-10-03. Live at mission-employed.vanndavidteng.com, nothing in flight.

## How to use this file

Everything that was planned is built, deployed and recorded below as history,
with the decisions worth remembering. The original copy-paste briefs are in git
history (`git log -p -- TASKS.md`).

**If work resumes**, start with the list right below. Each item has a
copy-paste brief: a fenced block you can paste straight into a fresh `claude`
session in this folder. Project context comes from `CLAUDE.md`, which loads
automatically. Work is test-driven:
[`.cursor/rules/tdd.mdc`](.cursor/rules/tdd.mdc) is the how-to. A new task
gets the same treatment: a box, a brief, and a tick when it lands.

---

## If work resumes

Nothing here is broken today. These are the things that will need a hand
eventually, soonest first.

### Move uptime monitoring to an external service

- [ ] Needs the user to create the account; then about ten minutes

```
The Uptime workflow is scheduled every 10 minutes, but GitHub runs it every
few hours (a median of about 5 hours between runs in Sep–Oct 2026; see
Monitoring in DEPLOYMENT.md). The first real outage, on 2026-10-13, was a
network-level blip at the host: the server and containers stayed up, and it
was caught only because a run happened to land inside it.

Once the user has a free UptimeRobot or Better Stack account, add HTTP(S)
monitors at a 5-minute interval with email alerts for:
  https://mission-employed.vanndavidteng.com/                 (keyword: id="root")
  https://mission-employed.vanndavidteng.com/api/health        (keyword: "status":"ok")
  https://mission-employed.vanndavidteng.com/.well-known/oauth-protected-resource/mcp
plus the service's SSL-expiry alert. The user does this in the service's UI,
or gives you an API key for it; never commit that key.

Then update Monitoring in DEPLOYMENT.md to name the service as the alarm and
uptime.yml as the backstop, keep uptime.yml (it costs nothing on a public
repo), and drop the "Re-enable the uptime monitor" item below, since nothing
will depend on it. Tick this box with the date.
```

### Re-enable the uptime monitor

- [ ] Due around 2026-12-12, if nothing has been pushed by then

```
GitHub pauses scheduled workflows in a public repository after 60 days with no
commits. When that happens the Uptime workflow (.github/workflows/uptime.yml)
stops probing mission-employed.vanndavidteng.com and nothing says the site is
down. GitHub emails a warning first.

Re-enable it with `gh workflow enable uptime.yml`, or Actions -> Uptime ->
Enable workflow. Then trigger one run (`gh workflow run uptime.yml`) and
confirm it is green. Tick this box in TASKS.md with the date, and if the
project is still parked, move the due date on by 60 days rather than ticking.
```

### Refresh Gemini prices after 2027-01-01

- [ ] Due 2027-01-01

```
backend/config/ai_pricing.php holds Gemini prices from 2026-09-26, and its
header notes several rise on 2027-01-01. They only feed the admin usage
screen's cost estimate, and a recorded cost is fixed at call time, so a stale
price misreports cost and breaks nothing else.

Read https://ai.google.dev/gemini-api/docs/pricing for the three models in the
file (and any model the server .env now sets in GEMINI_MODEL,
GEMINI_TTS_MODEL or GEMINI_LIVE_MODEL). Update the numbers and the "as of"
date. While there, check gemini-2.5-flash-preview-tts is still served: preview
models get retired, and if it is, pick its replacement, set GEMINI_TTS_MODEL in
the server .env (ssh vps, see DEPLOYMENT.md) and the default in
GeminiService / config/services.php / .env.example, and add its price.

Verify with: cd backend && php artisan test. Tick this box with the date.
```

### Decide on the legacy Express accounts

- [ ] Whenever; needs a decision, not code

```
The retired Express server kept its accounts in a JSON file. Laravel started
from an empty database (see Deployment in TASKS.md), so those accounts were
never ported. The file is still on the server in the docker volume
mission-employed_api_data, and backed up as
/root/backups/mission-employed/api_data.20260902-010243.tgz.

Ask the user whether any of those accounts are worth porting. If not, remove
the volume with `ssh vps docker volume rm mission-employed_api_data`, keeping
the tgz. Do not remove the backup without asking. Record the outcome here and
tick this box.
```

---

# History

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

### 2.2 Tracker API ✅

- [x] Done — applications CRUD with the status event log written in one place,
  nested interview stages, profile, coding history and behavioral answers. All
  `auth:sanctum`, and someone else's record is a 404 rather than a 403. 40
  feature tests.

### 2.3 AI endpoints ✅

- [x] Done — 12 routes behind `auth:sanctum` + `premium`, every surviving
  prompt and schema ported verbatim into `App\Services\Ai`, chat sessions in
  `ai_sessions`/`ai_messages` replayed through `GeminiClient::chat()` with a
  40-message window, and 41 feature tests that assert the prompt and schema
  sent, not just the status code.

---

## Wave 3 — Client

Needs Wave 2. **3.1 must land before the other four**, which can then run together.

### 3.1 Replace the data layer ✅

- [x] Done — the `localStorage` state blob and `migrateState` are gone; four
  providers under `frontend/contexts/` load from the API on mount, expose
  `loading`/`error`/`saving` and write through, and `App.tsx` owns no domain
  state. `services/http.ts` is the one place errors and the `data` envelope are
  handled.

### 3.2 Tracker screens ✅

- [x] Done, closed 2026-10-03. The screens moved onto the API piecemeal with
  3.1 and 3.2a–3.2d rather than as one task. Closing it found two gaps, both
  fixed: the Job Applications screen never showed the context's `loading` or
  `error`, so a failed save rolled back silently and a failed first load looked
  like an empty tracker (it now has a "Loading" state and an error banner with
  Retry); and the CV and cover letter studios swallowed every failure into
  `console.error` (they now say why, premium and AI outage included). The
  Refine chats are 3.12.

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

### 3.2e Rows per page, saved on the account ✅

- [x] Done, 2026-10-14. The tracker table had a fixed 5 rows per page. A "Rows
  per page" select (5, 10, 25, 50, 100) now sits under the table and the
  mobile cards. It shows whenever the list is non-empty, so a user who picked
  100 can still go back down. Changing it keeps the row that was at the top on
  screen (`pageAfterResize`).
  - Saved per account, not per browser, so the choice follows the user to
    another device: `users.preferences` (JSON, nullable, not fillable), read
    back on `/auth/me` as `preferences.applicationsPageSize` with defaults
    filled in by `User::effectivePreferences()`. A stored value no longer
    offered reads as the default.
  - Written by `PATCH /api/auth/preferences`, which merges, so one preference
    never resets another. Unknown keys are dropped, and a size outside the
    list is a 422. The allowed list is `User::APPLICATIONS_PAGE_SIZES` and
    `APPLICATIONS_PAGE_SIZES` in `utils/applicationTable.ts`; change both
    together.
  - The client applies the choice at once (`AuthContext.updatePreferences`)
    and does not apply the response, so a slow answer cannot undo a later
    choice. A failed save keeps the choice for the session and toasts that it
    will not be remembered.
  - Theme stays in `localStorage`. It is a device choice, not an account one.

### 3.3 Coding practice and dashboard ✅

- [x] Done — dashboard slimmed to coding practice, pipeline summary and upcoming
  interviews; tutor wired to the session endpoints with real error handling.
  An in-progress tutor conversation resumes after a refresh (the session id is
  kept in localStorage per user and read back with `fetchSession`).

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

### 3.5 Plans end to end ✅

- [x] Done, closed 2026-10-03; built up across 3.1, 3.4, 3.7 and 3.11. The
  client's `isPremium` is `isPremiumUser()`, the same rule as
  `User::isPremium()`. AI features show `PremiumGate` up front on a free plan,
  and a 403 `premium_required` that gets past it (a stale plan) surfaces as the
  upgrade message rather than a raw error. `/account/admin` redirects non-admins
  and is absent from their sidebar. The walk in 4.4 confirmed the loop against
  the real API: free user refused, admin upgrades, feature unlocks.

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
- [x] Follow-up. A user's long spoken answer came out as "I'm not a robot.", which
  is what the transcriber invents for near-silence. A headless run with a
  silent microphone reproduced it ("¿Qué tal?", after which the interviewer
  switched to Spanish). Changes:
  - Capture runs at 16 kHz, so the browser resamples the device itself. Before,
    it used the output device's rate, and a Bluetooth headset in call mode runs
    at 8 kHz, which the converter zero-padded into noise. `downsampleToPcm16`
    now interpolates below 16 kHz too. Firefox falls back to the device rate.
  - The mic context is explicitly resumed.
  - Each take reports its level. Below 0.006 RMS the screen says "We barely
    heard you" and the invented transcript is not stored.
  - There is a level meter while recording (`LevelMeter`, moved out of `PrepRoom`).
  - The Live instruction pins English and asks the interviewer to have an
    unclear answer repeated.
- [x] Follow-up. A user's screen stuck on "Interviewer thinking..." for good. The
  cause is unconfirmed: the tab was probably on the pre-fix build, and the
  server logs were lost in the deploy restart. Measured and ruled out: answer
  length (a 60 s streamed answer replies in 1.2 s) and silence (Gemini
  replies even to zeros). An answer with no audio at all makes Gemini close
  with 1007, which was already recovered from, but silently. The fix is a
  guarantee rather than a diagnosis:
  - `useLiveInterview` gives up after 15 s with no sign of a reply. It drops
    the connection and says so, and the next answer reconnects and replays.
    Any server message resets the wait.
  - A connection that closes mid-answer or mid-reply now shows a message.
  - `geminiLive` logs the close code and reason to the console
    (`Interview connection closed: 1007 ...`) for the next report.

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

### 3.7 Per-user AI usage for admins ✅

- [x] Done. `/account/admin` shows each user's Gemini tokens and estimated cost
  over 7, 30 or 90 days, plus all-time cost and when they last used AI. A
  per-feature breakdown opens from the token count, and users are sorted
  heaviest first. Counting starts from this deploy, with no backfill.
  - Server calls: `GeminiService::post()` hands each reply's `usageMetadata`
    to `UsageRecorder`. `DatabaseUsageRecorder` writes an `ai_usage` row with
    the signed-in user and the route pattern (`ai/job/parse`). MCP calls are
    attributed the same way. Only the successful attempt of a retried call
    counts. A failed write is logged and never fails the feature.
  - Voice interview: Live sends one `usageMetadata` per turn, confirmed by
    probe to be that turn's billed tokens and not a running total. The
    browser sums it per exchange and posts it with `/exchanges`, where it is
    stored as `source = live` and labelled "reported by browser". A tampered
    client could under-report its own usage.
  - Cost: `config/ai_pricing.php`, USD per 1M tokens (equivalently
    micro-dollars per token), audio priced separately, thinking at the text
    output rate. It is fixed when recorded. A model with no price stores
    `cost_micros = null` and shows as "+n unpriced", never $0. Several prices
    rise on 2027-01-01.
  - Endpoint: `GET /api/admin/usage?days=` (1–365, default 30).
  - Found by the end-to-end run: binding `UsageRecorder` in the *deferred*
    `GeminiServiceProvider` made it unresolvable behind a stale
    `bootstrap/cache/services.php`. The exchange endpoint then returned 500
    and lost the transcript. It is now bound in `AppServiceProvider`, and
    `/exchanges` records usage inside a try/catch.
  - Measured locally: one voice exchange costs about $0.005, and a
    three-exchange interview with its report about $0.02.

### 3.8 Mock interview history ✅

- [x] Done. The mock screen lists past interviews under "Begin Session", newest
  first, with company, role, date, message count and whether a report exists.
  Opening one shows its report and full transcript read-only; an interview
  that ended without a report can have one generated there, and one can be
  deleted after a confirm.
  - Endpoints: `GET /api/ai/mock/sessions` (summaries only; sessions with no
    messages are left out as abandoned) and `DELETE /api/ai/mock/sessions/{id}`
    (messages cascade). `GET /api/ai/sessions/{id}` now includes `report`.
  - Components: `MockHistory.tsx` (`MockHistoryList`, `MockReview`, and the
    `TurnBubble` shared with the live view).
  - MCP: `list_mock_interviews`; `get_session` reads one back with its report.

### 3.9 Settings page for appearance ✅

- [x] Done. The colour theme and light/dark toggle moved off the sidebar onto
  a new `/settings` page (sidebar entry "Settings"). Still a per-device
  preference in localStorage (`theme`, `theme_palette`), not account data.
  Theme state lives in `contexts/ThemeContext.tsx`, wrapped outside the auth
  gate so the sign-in screen is themed too.

### 3.10 ATS score check ✅

- [x] Done, 2026-09-29. Each application can have its CV scored against its job
  description out of 100, the way an ATS keyword screen reads it. The drawer
  has an "ATS Score" section below Tailored CV. It picks the tailored or base
  CV and shows missing keywords (required first), the matched ones, and five
  format checks: contact details, standard sections, job title, length and
  measurable results. It flags a report as stale when the CV or JD has changed
  since. The tracker table shows an "ATS 82" pill.
  - Design: the model only lists the JD's keywords (term, aliases, kind,
    required), and `AtsScorer` matches them deterministically. The score is 80
    points of weighted coverage (required ×2, soft skills ×½) plus 4 points per
    passed format check. Keywords are cached in `applications.ats_keywords`
    under a hash of role + JD, so re-checking after editing the CV makes no
    model call. The report lives in `ats_report`, with JD and CV hashes that the
    API turns into `stale`. Both columns are server-owned.
  - Endpoint: `POST /api/ai/applications/{id}/ats` `{ source?: 'tailored'|'base' }`,
    premium. A blank JD or CV is a 422, and so is a JD with no readable keywords.
    `atsReport` rides along on every application payload.
  - Components: `AtsScore.tsx` (`AtsScorePanel`, `AtsBadge`), and
    `checkAtsScore` in `ApplicationsContext`, which flushes queued edits first.
  - MCP: `check_ats_score`.
  - Follow-up, 2026-09-30: the drawer's job description is now editable
    (Add / Edit, then Save), because there was no way to supply one after
    creation. Seek-tracked rows carry only the listing teaser, and imported rows
    often carry nothing. Notes still show under it when they differ. Notes that
    were only a copy of the old description, as the add form and Seek tracking
    make them, follow the new one.

### 3.11 Admins can deactivate accounts ✅

- [x] Done, 2026-10-01. `/account/admin` has a Deactivate button on every row
  except your own. It asks for confirmation first. Deactivated rows are dimmed,
  carry a "Deactivated" badge and offer Reactivate instead. Deactivation is a
  lock, not a delete: the account's applications, CVs and history are kept, and
  reactivating restores it as it was.
  - Column: `users.deactivated_at`, nullable, where null means active. It is
    server-owned and not fillable. `UserResource` sends it as `deactivatedAt`.
  - Endpoint: `PATCH /api/admin/users/{id}/active` `{ active: bool }`, admin
    only. Deactivating deletes every Sanctum token the account holds, so the
    browser, the phone and any MCP connector are all signed out at once.
    Deactivating twice keeps the original date.
  - Self-deactivation is a 403 `self_deactivation`. Because of that, the admin
    acting is always active, so deactivating *another* admin is allowed.
    `admin:bootstrap` also clears `deactivated_at` on the env admin, so a
    restart still recovers that account.
  - Login: the password is checked first. A wrong one gets the usual 422, so a
    guess does not reveal the account's state. A right one on a deactivated
    account gets 403 `account_deactivated`, and the sign-in screen shows that
    message. The MCP connector's hosted login page now says the account is
    deactivated instead of "Could not reach Mission-Employed".
  - Second line of defence: `Sanctum::authenticateAccessTokensUsing` in
    `AppServiceProvider` refuses any token belonging to a deactivated account.
    That covers a token issued by a login racing the admin's click.
  - The MCP server has no admin tools, so it has no deactivate tool either.

### 3.12 Refine chats for the CV and cover letter ✅

- [x] Done, 2026-10-03. The Refine box under both studios did nothing: the
  session-create routes were never ported in 2.3, so the client threw a 501
  that the studio swallowed. Added `POST /api/ai/cover-letter/sessions` and
  `POST /api/ai/cv/sessions` (premium; `{company, role, jobDescription?,
  document}`; no model call), with the Express prompts ported verbatim into
  `DocumentPrompts`. Turns go through the shared
  `/api/ai/sessions/{session}/messages`, so usage lands under "Tutor and refine
  chat". The client opens the session on the first Refine over the text on
  screen, so it works on a saved document, and a hand edit or a new draft
  starts a fresh one (`hooks/useDocumentStudio.ts`). That was the last prompt
  left in `server/`.

## Wave 4 — Close out

All done. Express served production until 4.1; it is gone since 4.2.

### 4.1 Laravel production image and nginx cutover ✅

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
the model the Express backend had been serving.

The Gemini model question this task left open is settled: `gemini-3.7-flash`
is the default in code and what the server `.env` pins.

### 4.2 Retire Express ✅

- [x] Done, 2026-10-03. `server/`, `Dockerfile.api`, the `api` compose service
  and its volume declaration, and nginx's `/ai/` location are gone, after 3.12
  ported the last prompts. The frontend lost `@google/genai` (only a dead
  `createPCMBlob` helper imported it), `supertest`, the `server` script, and
  the `vite.config.ts` `define` block that would have inlined
  `GEMINI_API_KEY` into the bundle. Checked by building with a canary key set:
  it appears nowhere in `dist/`. `deploy.sh` runs `up --remove-orphans`, so
  the old container went with the deploy. The `mission-employed_api_data`
  volume (the legacy Express accounts JSON) was deliberately left on the
  server. See "If work resumes".

### 4.3 Test coverage pass ✅

- [x] Done — `AiPremiumGateTest` walks every AI route as a free user (403 +
  `premium_required`, Gemini never called). Remaining FormRequest 422s
  (behavioral theme, document jobDescription/cv) and session-message Gemini
  containment (exact JSON, no upstream body). `Tests\TestCase` now
  `preventStrayRequests()` by default. Frontend: `http.ts` contract tests and
  `PremiumGate`. CI runs `tsc --noEmit`.

### 4.4 CI and a real end-to-end run ✅

- [x] **CI half** — `.github/workflows/ci.yml` already ran PHPUnit, Vitest and
  the frontend build from a clean checkout; it now also runs `npx tsc --noEmit`.
- [x] **Live walk, 2026-10-03**, against the real Gemini API on a throwaway
  database, driven over HTTP. Free user refused (403 `premium_required`), admin
  upgrade unlocks it. Coding problem and tutor; the API was **restarted
  mid-conversation** and the session read back intact and continued in
  context. Tracker: JD parse, create, stage, tailored CV and cover letter, both
  Refine chats, save, ATS check and the free re-check, all persisted. Practice
  question, TTS (valid WAV), typed mock interview through to its report and
  history. Usage recorded per feature: 14 calls, $0.038. Login lockout: 429
  on the sixth try. Not driven here: microphone-only paths (behavioral answer
  evaluation, the Live voice interview), which 3.4 and 3.6 exercised in
  headless Chromium.

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

- [x] Done. `uptime.yml` runs `scripts/uptime-check.sh` on a 10-minute schedule
  against the SPA, `/api/health`, the MCP resource metadata and the TLS expiry.
  It opens one `outage` issue on failure and closes it on recovery.
  `/api/health` now checks SQLite and storage and returns 503 when either
  fails. Laravel logs to stderr in production. See "Monitoring" in
  `DEPLOYMENT.md`. Telescope was considered and rejected: it is a local
  debugging tool that writes every request to the database, and it cannot
  tell you the site is down.

### 4.7 Parking the project ✅

- [x] Done, 2026-10-03. Rate limits on the two routes reachable without a token:
  login 5/min per email + IP, registration 10/hour per IP. `bootstrap/app.php`
  now trusts the private Docker ranges as proxies, because without it every
  request's IP was nginx's and any per-IP limit would have been global.
  Nightly SQLite backups (`scripts/backup.sh`, 30 days, see `DEPLOYMENT.md`).
  Dependency audits clean: `league/commonmark` and `laravel/framework` patched
  within `^12`, `react-router` patched. Stale branches, PRs and the leftover
  worktree cleaned up; `.claude/settings.json` and its hook scripts are now
  tracked.

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

---

## Deployment

**The app is live at `mission-employed.vanndavidteng.com`, and a green push to
`main` deploys it automatically** (task 4.5, [`DEPLOYMENT.md`](DEPLOYMENT.md),
which also covers monitoring and backups).

The stack is docker compose behind Traefik:

| Service | Image | Role |
| --- | --- | --- |
| `nginx` | `Dockerfile` | Serves the built SPA, proxies `/api/` to Laravel and the OAuth + `/mcp` paths to `mcp` |
| `laravel` | `Dockerfile.laravel` | The Laravel API on `:8080`, SQLite on the `laravel_data` volume |
| `mcp` | `Dockerfile.mcp` | The remote MCP connector (task 5.2) |

`docker-compose.prod.yml` adds the Traefik labels and TLS. `nginx.conf` sets
`client_max_body_size 10m`, since mock interviews POST base64 audio and nginx
would 413 before the backend ever saw it, and a 300s read timeout because
model calls are slow.

`.env` on the server is not in git and holds `APP_KEY`, `GEMINI_API_KEY`, the
admin credentials and `MCP_OAUTH_SECRET`. Never overwrite it from the repo. The
SQLite database is on the `laravel_data` volume, so a rebuild keeps it but
`docker compose down -v` would destroy it. Backups of `.env` and the database
are in `/root/backups/mission-employed/`.

**Accounts did not migrate.** The Express users lived in a JSON file on the
`api_data` volume and Laravel started from an empty SQLite database, so
everyone except the bootstrap admin had to register again. The old file is
still there; deciding its fate is under "If work resumes".

## Carried over from the old server

Things found in the Express code that are **not** being reproduced as-is.

- **The API key is wired into the client build.** `vite.config.ts` defines
  `process.env.API_KEY` from `GEMINI_API_KEY`. No frontend file reads it today so
  nothing leaks yet, but the substitution is live — the first component to
  reference that name ships the key to every browser. Removed in 4.2.
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

## Decisions on record

What used to be the open questions, now that each has an answer.

- **IDs are integers.** Applications and interview stages were client-generated
  UUID strings; they are auto-increment integers from the database.
- **`recruiterContact` is flattened** to three nullable columns, so "no
  recruiter" and "recruiter with blank fields" are indistinguishable in
  storage. The `Application::recruiter_contact` accessor normalizes it,
  treating blank strings as absent. Use it rather than reimplementing the check.
- **Blank dates are `null`.** The client sends `''` for untouched inputs;
  `toApplicationPayload` sends `null` and the FormRequests normalize too.
- **Status is stored twice**, the current value on `applications` plus the event
  log, and `ApplicationController` keeps them in sync in one place.
- **`behavioral_answers` is per-user global**, not per-application, and a theme
  can be emptied: `bullets` is `present` rather than `required`, and blank
  elements are dropped rather than rejected.
- **TypeScript is strict.** `@types/react` is installed and `strict` is on in
  `frontend/tsconfig.json`, so a clean `tsc --noEmit` means something.
- **Chat history is capped.** Every turn resends the transcript, so
  `AiController::HISTORY_LIMIT` replays the last 40 messages; the persona lives
  in `system_instruction` and is never dropped.
- **TTS is wrapped server-side.** Gemini returns raw headerless PCM at
  `audio/L16;rate=24000`; `PcmWavEncoder` prepends the 44-byte RIFF header, so
  `POST /api/ai/tts` answers a playable `audio/wav`.
- **`npm install` in `mcp/` with vitest crashes npm 10.9.2** (an arborist
  peer-resolution bug), which is why `mcp/` tests run on `node:test` via `tsx`.

## Seeder credentials

`php artisan migrate:fresh --seed` creates an admin on the premium plan and an
ordinary free user. Defaults, overridable in `backend/.env`:

| | Email | Password |
| --- | --- | --- |
| Admin, premium | `admin@mission-employed.test` | `password` |
| User, free | `user@mission-employed.test` | `password` |
