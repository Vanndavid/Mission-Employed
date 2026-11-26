# Mission-Employed

A job-hunting SaaS: practice coding, track applications with AI-tailored CVs and
cover letters, rehearse interviews.

**The rebuild is finished and the project is parked** (2026-10-03): live,
deployed from `main`, nothing in flight. It was briefly unparked on 2026-10-17
to make plans configurable (6.1 in `TASKS.md`), and on 2026-11-26 to let an
admin hide sidebar tabs (6.2). `TASKS.md` at the repo root
records what was built and why, and ends with the follow-ups worth doing if
work resumes — each as a copy-paste brief. Keep it updated as work lands rather
than letting it go stale.

## Stack

| | |
| --- | --- |
| `backend/` | Laravel 12, PHP 8.3, Sanctum bearer tokens, SQLite |
| `frontend/` | React 19, TypeScript, Vite 6, Tailwind, Vitest |
| `mcp/` | MCP server over the Laravel API — Node 22, TypeScript, Express (hosted OAuth mode), `node:test` |

Separate packages with their own dependencies and test runners.

## Running it

```bash
./dev.sh                                    # both servers, Ctrl-C stops both

cd backend  && php artisan serve            # :8000
cd frontend && npm run dev                  # :3000, proxies /api to :8000
```

Tests:

```bash
cd backend  && php artisan test
cd frontend && npm test && npx tsc --noEmit
cd mcp      && npm test && npm run typecheck
```

Write the failing test first. The working loop — where to put a test, what
to assert, the commands — is [`.cursor/rules/tdd.mdc`](.cursor/rules/tdd.mdc).
Feature tests use model factories. Tests must never hit the network:
`Tests\TestCase` calls `Http::preventStrayRequests()`, and anything that talks
to a model binds `FakeGeminiService`. Do not bind the fake globally —
`GeminiServiceTest` exercises the real client with `Http::fake()`. Frontend
tests go through `services/http.ts` (`ApiError`, `apiRequest`, `apiResource`)
rather than raw `fetch`.

## Constraints that are not preferences

- **SQLite is forced.** This PHP build has `pdo_sqlite` but no `pdo_mysql`. Keep
  migrations portable so another driver stays possible, and remember SQLite
  rebuilds tables on `ALTER`.
- **Auth is bearer tokens, not cookie SPA mode.** The client stores its token in
  `localStorage` under `mission_employed_token` and sends `Authorization: Bearer`.
  `config/sanctum.php` has `stateful` and `guard` emptied so nothing falls back to
  the session guard.
- **Gemini has no official PHP SDK.** All model calls go through
  `App\Services\GeminiService` over Laravel's HTTP client. It is deliberately
  **stateless** — `chat()` takes the full message history as an argument. Sessions
  live in the `ai_sessions` / `ai_messages` tables, because the old Express version
  held them in an in-memory `Map` and lost them on every restart.
- **Never let upstream API errors reach the client.** The Express server did
  exactly this (`res.status(500).json({ error: e.message })`). `GeminiException`
  keeps upstream detail in a separate accessor for logging, not in `getMessage()`.

## Deployment — main is live

**Pushing to `main` deploys** to `mission-employed.vanndavidteng.com` once CI is
green. The CI `deploy` job runs `scripts/deploy.sh` on the server over a
command-restricted SSH key, and the script rolls back if health checks fail.
[`DEPLOYMENT.md`](DEPLOYMENT.md) has the design, the manual redeploy and
rollback steps, and the secrets. There is no staging, so treat `main`
accordingly.

The stack is docker compose behind Traefik:

- `Dockerfile` builds the SPA from `frontend/` and serves it from nginx.
- `Dockerfile.laravel` is the API, with SQLite on the `laravel_data` volume.
- `Dockerfile.mcp` is the remote MCP connector (see below).
- `nginx.conf` keeps `client_max_body_size 10m` (mock interviews POST base64
  audio) and `proxy_read_timeout 300s` (model calls are slow).
- The server `.env` is not in git and a deploy never touches it. A new required
  key has to be added there before the deploy that needs it.

## The MCP server

`mcp/` exposes the same API to an MCP client (Claude Code, Claude Desktop,
Cowork) so an application can be tracked or a CV tailored from a conversation.
It is a **thin client** — ownership checks, validation, the status timeline and
the plan's feature gates and limits stay in Laravel, and no rule is
reimplemented there. When an endpoint changes shape, the matching tool in
`mcp/src/tools/` changes with it.

Audio round trips (`/api/ai/behavioral/evaluate`, `/api/ai/tts`, and the Gemini
Live mock interview's `/live` and `/exchanges`) are deliberately not exposed:
they only make sense in the browser. The typed mock `/turns` route stays for the
MCP tools. See `mcp/README.md`.

The practice modes are tools too (`mcp/src/tools/practice.ts`): the quiz, code
review and system design routes, progress and history, and reporting a question,
never the admin bank.
The user is the one practising, so the tool descriptions and the server
instructions tell the client to ask each question and send the user's own
answer, never to answer for them or reveal an answer first. The tools that serve
a question pass on only the fields it is served with, so no key reaches the
model before the user has answered. A new practice route gets its tool there.

It is deployed as the `mcp` compose service. It serves OAuth plus `/mcp`, so
Claude and Cowork can add it as a custom connector. All of its OAuth state is
sealed with `MCP_OAUTH_SECRET` from the server `.env`, and it keeps no database.
Email sync is deliberately done by the *client's* Gmail connector, driven by the
`sync_job_emails` prompt. Do not add mailbox access to the app.

Every account sees how to connect under **Connect an AI agent** on Settings
(`ConnectAgentSection.tsx`). If the connector's address, sign-in or setup
changes, change that section with it.

## Scope — this is the whole product

Five things. Anything not on this list was deliberately deleted, so do not
reintroduce it or build features that depend on it:

1. **SaaS shell** — register/login, `free` and `premium` plans, `user` and `admin`
   roles. **What each plan includes, and how often, is set by an admin** on
   Admin · Plans & limits: per feature, included or not and a limit per day,
   week or month, plus a requests-per-minute cap per plan. Users see their
   allowances and both plans on Plan & usage, and press **Request Premium**;
   an admin grants Premium by hand, for a period or with no end date. There is
   no payment integration yet (the follow-up in `TASKS.md` needs the user to
   pick a provider). An admin can also deactivate an account, which locks it
   and revokes its tokens but keeps its data, and reactivate it later, and
   **hide feature tabs** from every user's sidebar (Training Room is hidden by
   default).
2. **Coding practice** — software engineering only, as modes on Mission
   Control. **Problems**: problem generation, AI tutor chat, attempt history.
   **Quiz**: multiple-choice questions on a language (JavaScript, Python, Java,
   SQL) from a hand-written bank, in rounds of ten, each answer explained and
   scored on the server in code, missed questions brought back later. The quiz
   is free on every plan and never metered. **Code review**: review a 20 to
   80 line snippet like a pull request, commenting on lines; the AI matches
   the comments to the issues planted in it and the score is computed from
   that (the `code_review` plan feature). **System design**: a scenario with
   scale numbers ("a URL shortener for 100M new links a month") answered in
   seven fixed sections, scored out of 100 against a fixed rubric (code applies
   the word gates and adds up, the AI rates the traits against written
   descriptors and the scenario's key points), with a report on how the score
   was reached; the `system_design` plan feature. More modes are planned on
   the same question bank (epic #21, `TASKS.md` Wave 7). An admin grows the bank on
   **Admin · Question bank**: the AI drafts questions, code checks each one,
   and users only ever see what an admin has reviewed and published. Users can
   report a question they think is wrong.
3. **Job application tracker** — CRUD, statuses, interview stages, paste-a-JD
   parsing, tailored CV and cover letter, and **spreadsheet import**: drop in an
   `.xlsx`/`.xls`/`.csv` whose columns are named anything at all, an AI proposes
   the column mapping, you correct it and review the rows, and committing fills
   blanks on applications already tracked rather than duplicating them. Plus an
   **ATS score check**: the application's CV scored against its job description
   for keywords and format, as an applicant tracking system's screen would.
4. **Interview practice** — one question at a time: prompt, answer, AI feedback,
   spoken playback.
5. **Full mock interview** — multi-turn session ending in a written report.

Deleted and staying deleted: talent ranking, analytics, contacts, the Codex/rules
page, offer tools and negotiation scripts, follow-up emails,
hunt personas and onboarding, criteria scoring, daily logs and task streaks,
the emergency modal.

> This list used to say "import/export". What was cut was the old blind bulk
> import — exact header match, a POST per row, no dedupe. Spreadsheet import as
> described in 3 above replaces it and is a first-class feature; CSV export
> stays as it is.

> The ATS check is not "criteria scoring". That scored a job against the user's
> own wish-list and never read the CV; this scores the CV against the job.

> This list used to say "system design drills". What was cut (e0db404) was a
> free-form mentor chat ending in an unstructured evaluation. The owner asked for
> system design practice back on 2026-11-26, and the rubric-scored mode in 2
> above replaced it: a structured answer scored against a fixed rubric, so
> scores are consistent and comparable. Do not bring back the chat drill.
> `system_design` is also still a valid **interview stage type** in the
> tracker — people get scheduled for one.

## Conventions

- Enums live in `backend/app/Enums` and are cast on the model (`JobStatus`,
  `AccountPlan`, `AccountRole`, `Feature`, `QuotaPeriod`, `NavTab`,
  `PracticeKind`, `PracticeLanguage`, `PracticeQuestionStatus`,
  `PracticeQuestionSource`). Each has a `values()` helper for validation rules.
- **Every paid route names its plan feature.** `routes/api/ai.php` puts
  `feature:<key>` on each route (`App\Http\Middleware\EnsureFeature`): it
  refuses a plan without the feature (403 `premium_required`, or
  `feature_unavailable` when Premium lacks it too), claims one use, and hands
  the use back if the response is not a success. `,access` checks without
  counting (opening, reading, deleting a session), `,deferred` lets the
  controller call `EnsureFeature::charge()` only when it does paid work (the
  ATS check, whose re-checks are free), and `feature:session` takes the feature
  from the session's kind. A used-up allowance is 429 `quota_exceeded`; the
  per-minute cap (`throttle:features`) is 429 `rate_limited`. Admins are never
  refused but are counted. The catalog is the `Feature` enum, because code
  enforces it; an admin edits only its terms (`plans`, `plan_features`), and a
  feature or plan with no row reads as the defaults in `Feature` and
  `AccountPlan`, so nothing is seeded. A new paid route needs a `Feature`
  case (label, description, group, `defaultSetting()`), the middleware on the
  route, `FeatureKey` in `frontend/types/auth.ts`, and a row in
  `AiPremiumGateTest`. Uses live in `feature_usages`, separate from `ai_usage`
  (tokens and cost): a use is what the plan promises, so a failed call leaves
  none.
- **Hidden tabs are decluttering, not a gate.** `App\Enums\NavTab` lists the
  feature tabs an admin can hide, site-wide (`tab_settings`; no row reads as
  `NavTab::defaultHidden()`). The list rides beside `user` as `hiddenTabs` on
  `/auth/me`, login and register; `PUT /api/admin/tabs` replaces it. Users
  lose the tab and its route (`TabGate` sends them to the first visible tab);
  admins still see it, marked. The plan still decides what the features
  allow, so never use a hidden tab to restrict one. A new sidebar tab needs a
  `NavTab` case, `NavTabKey` in `frontend/types/auth.ts`, an entry in
  `frontend/utils/navTabs.ts` and a `TabGate` on its route. A **mode** is a
  tab too: its entry in `navTabs.ts` has `modeOf` (Quiz is
  `modeOf: 'mission_control'`), so it is drawn as a mode tab on that screen
  (`ModeTabs`) instead of in the sidebar, is listed in the admin's "Tabs users
  see" as "Mission Control · Quiz", and is a child route of the tab's path
  behind its own `TabGate` (`/dashboard/quiz` under the `MissionControl`
  layout). The sidebar entry stays while any of its modes is visible. Pages
  people do not use daily (Plan & Usage, Settings, admin) go in the sidebar's
  Account group by Log out, not in the main list.
- **The quiz is scored in code, and its key stays on the server.** Practice
  modes share one bank, `practice_questions` (`kind`, `language`, `topic`,
  `options`, `answer` as per-kind JSON, `status` draft|published, `source`
  seed|ai|admin, `external_id`), and one append-only `practice_attempts`
  table (`response`, `score`/`max_score`, `correct`, `feedback`,
  `rubric_version`). `answer` is hidden from serialization: a round
  (`QuizQuestionResource`) carries no answer or explanation, and
  `POST /api/practice/quiz/answers` is the only place an answer is compared
  and the first place the key leaves the server. A draft, an unknown id and
  another kind's question are the same bare 404. An open mistake is a
  question whose latest attempt was wrong; progress is worked out from
  attempts every time, not stored. The quiz never calls a model, so its
  routes in `routes/api/practice.php` name no `feature:` and nothing is metered;
  keep it that way (`PracticeQuizTest` asserts no `feature_usages` row and no Gemini
  call). Topics are code, `PracticeLanguage::topics()`. The MCP server wraps
  these routes (`mcp/src/tools/practice.ts`, 7.6).
- **The hand-written bank ships with a deploy.** It lives in
  `backend/resources/practice/<kind>/<language>.json` (format in
  `App\Services\Practice\SeedBank`). `php artisan practice:sync` runs in
  `docker/laravel-entrypoint.sh` after `migrate --force` and in
  `DatabaseSeeder`: it upserts by `external_id` as published `seed` rows, puts
  a seed row that left the files back to draft (attempts keep it), never
  touches an `ai` or `admin` row, and running it twice changes nothing. A
  malformed question fails it and writes nothing, which fails the boot and
  rolls the deploy back. A wrong answer key is the worst bug the quiz can
  have: `PracticeSeedContentTest` checks every question straight from the
  files, and a new question's key should be run, not reasoned about, where
  the language allows. Seed rows are read-only on the question bank (422): a
  seeded question is fixed in its file, or the next sync would put the file's
  version back.
- **AI drafts are reviewed before users see them.** `POST
  /api/admin/practice/questions/generate` makes one `generateJson` call, and
  every item goes through the kind's checks in code before anything is saved
  (`QuizDraftValidator` for the quiz: four distinct options, the answer one of
  them, an explanation, a snippet of at most 40 lines, the language and topic
  asked for; `CodeReviewDraftValidator` and `SystemDesignDraftValidator`
  wrap the seed files' item validators, so a draft meets the hand-written
  rules, and a code review draft's ranges must land on the lines the model
  quoted). What passes is saved as a `draft` with `source` ai, which no
  user route serves; what fails comes back with its reasons. The model's
  one-line note per wrong option goes in `review_notes`, hidden from
  serialization like `answer`. Every admin save (`PATCH`, publishing
  included) re-runs the same validator, so an edit cannot publish what a
  draft could not. Deleting a question with attempts unpublishes it instead.
  A kind plugs in with a `DraftKind` (request rules, prompt, schema, item
  mapping, validator) registered in `App\Services\Practice\DraftKinds`; an
  unregistered kind is a 422. These are admin routes
  (`routes/api/practice_bank.php`), so they take no `feature:`; the draft
  call's tokens are recorded as usual. Reports (`practice_question_reports`)
  are one per user per question; an admin resolving them keeps the rows and
  clears the open count.
- **A system design score is computed by the rubric; the AI only rates.**
  `App\Services\Practice\SystemDesignRubric` (`VERSION` `sd-1`) owns the seven
  sections, the seven traits with their weights and descriptors (product copy,
  shown under "How this was scored"), the gate and the sum. A trait whose
  sections have fewer than 15 words between them scores 0 and is left out of
  the prompt: no name, descriptors or key points. The model rates only the
  rest, 0 to 4, each with a quote, an improvement and the key points covered;
  `SystemDesignScorer::sanitise()` clamps, drops a quote that is not in the
  answer, and ignores unknown traits and key points, and a reply that leaves a
  trait unrated is a 502 with nothing stored or charged. Changing a
  descriptor, a weight or the gate is a new `VERSION`: every attempt stores
  the one it was scored against. Key points are the key, `answer`
  `{"keyPoints": {trait: [...]}}`, and leave the server only in a scored
  answer; the scenario's title is the bank's `topic`, and `language` is null.
  Seeds are one scenario a file in `backend/resources/practice/system_design/`
  (`SystemDesignSeed`), and `SystemDesignItemValidator` holds the rules a
  scenario must meet, the same ones an AI draft has to pass. The routes
  (`/api/practice/system-design/*`) are behind `feature:system_design` and
  `throttle:features`; an answer under 15 words in all is a 422 before any of
  it. The MCP server wraps these routes too (7.6).
- A Premium plan can end: past `users.plan_expires_at` the account reads as
  Free everywhere (`User::isPremium()`, `effectivePlan()`). An admin setting
  either plan clears `premium_requested_at`.
- Every model has a factory. Feature tests use them rather than hand-built arrays.
- Tests must never hit the network. Bind `FakeGeminiService` for anything that
  touches a model. `Http::preventStrayRequests()` is on `Tests\TestCase` so a
  missed fake fails the test instead of opening a socket.
- **Spreadsheet import never overwrites.** A row matching something already
  tracked fills only fields that are currently blank, and a status moves forward
  along the pipeline or not at all. Re-importing the same sheet must stay a
  no-op — `frontend/utils/importMerge.ts` owns that and its tests assert it.
  The AI only maps the sheet's *vocabulary* (`POST /api/ai/import/plan`); the
  rows are applied deterministically client-side, and its answer is treated as
  untrusted input.
- **The ATS score is computed, not generated.** Same split as the import: the AI
  only lists the job description's keywords (`App\Services\Ats\AtsCheck`,
  sanitised as untrusted input), and `AtsScorer` matches them against the CV
  deterministically. Keywords are cached on the application under a hash of
  role + JD, so re-checking an edited CV makes no model call. `ats_keywords` and
  `ats_report` are server-owned: never fillable, never in `COLUMN_MAP`.
- **Code review: the AI matches, code scores.** A snippet's planted issues
  (`answer.issues`: id, lines, category, severity 1-3, summary, fix) never
  leave the server before a review is scored. One model call
  (`CodeReviewGrader`, prompt in `App\Services\Ai\CodeReviewPrompts`) says
  which comment indexes identify which issue and how good the suggested fix
  is; comments on an issue's lines are flagged as candidates, but the model
  decides. Its answer is sanitised (unknown ids, missing indexes and
  duplicates dropped), and `CodeReviewScorer` computes the score as a pure
  function: detection 70 by severity, fixes 20, precision 10. The attempt
  stores `rubric_version` `cr-1`; change it with the weights. What makes a
  snippet publishable is `CodeReviewItemValidator`, for seed files and AI
  drafts alike. A snippet's title is stored in `topic`.
- **`Ghosted` is set by the server.** An application at Applied with no status
  change and no interview stage for `Application::GHOSTED_AFTER_DAYS` (30) is
  moved to Ghosted when the tracker is read (`ghostUnanswered()` on `index` and
  `show`). There is no scheduler, so this is not a cron job. The event is
  dated when the 30 days ran out. In pipeline order it sits between Applied and
  Interviewing, so a reply moves it on and an import cannot move it back.
- `statusDate` is accepted on create and update but is **not a column**. It
  backdates the status event, which is why it is absent from
  `ApplicationRequest::COLUMN_MAP`.
- `behavioral_answers` is per-user global, not per-application, and unique on
  `(user_id, theme_id)`. Saves go through `updateOrCreate` — edit in place, don't
  accumulate rows.
- The client sends `''` for untouched inputs. Normalize empty strings to `null`
  before they reach nullable date columns. `Application::recruiter_contact` already
  handles this for the flattened recruiter fields — use it rather than
  reimplementing the check.
- Every Gemini call's token usage lands in `ai_usage` through `UsageRecorder`,
  so a new AI route is counted automatically. Give it a readable name in
  `frontend/utils/usageFormat.ts` for the admin breakdown, and a price in
  `backend/config/ai_pricing.php` if it uses a new model. A model with no
  price records its tokens with no cost.
- The retired Express backend (`server/`) was deleted once every prompt worth
  keeping had been ported; comments that cite `server/aiHandlers.js` refer to
  it, and `git log -- server/` still has it. Do not bring it back.
- Per-account UI preferences (rows per page in the tracker) live in
  `users.preferences`, come back on `/auth/me` with defaults filled in, and are
  saved by `PATCH /api/auth/preferences`. A new one needs a rule in
  `UpdatePreferencesRequest`, a default and a check in
  `User::effectivePreferences()`, and a key on `UserPreferences` in
  `frontend/types/auth.ts`. Theme is a device choice and stays in localStorage.
- Login and registration are rate limited (`AppServiceProvider`), which relies
  on `bootstrap/app.php` trusting the private Docker ranges as proxies so
  `$request->ip()` is the visitor and not nginx.
- **Practice progress, history and the coach are reads, not features.**
  `GET /api/practice/progress` (`PracticeProgressReport`) and
  `/api/practice/attempts[/{id}]` are worked out from `practice_attempts`
  every time, name no `feature:` and never call a model; someone else's
  attempt is a bare 404. Progress carries no answer key. An attempt's page
  reuses its mode's result view (`AnswerVerdict`, `ReviewResult`,
  `ScoreReport`), so a change to what a mode stores in `feedback` changes
  `PracticeAttemptDetailResource` and the progress report with it. The coach
  is the pure `frontend/utils/practiceCoach.ts`; its one-click starts are
  query strings the mode routes read (`utils/practiceLinks.ts`). A new mode
  adds its areas to both. No streaks or daily goals.
