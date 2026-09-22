# Mission-Employed

A job-hunting SaaS: practice coding, track applications with AI-tailored CVs and
cover letters, rehearse interviews.

**Currently mid-rebuild.** Read `TASKS.md` at the repo root before starting work —
it holds the live task list, what's done, and the open questions. Keep it updated
as work lands rather than letting it go stale.

## Stack

| | |
| --- | --- |
| `backend/` | Laravel 12, PHP 8.3, Sanctum bearer tokens, SQLite |
| `frontend/` | React 19, TypeScript, Vite 6, Tailwind, Vitest |
| `mcp/` | MCP server over the Laravel API — Node 22, TypeScript, `node:test` |

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

**The app is deployed at `mission-employed.vanndavidteng.com`** via docker
compose behind Traefik. `main` gets deployed; treat it accordingly.

- `Dockerfile` builds the SPA from `frontend/` and serves it from nginx.
- `Dockerfile.api` runs the **Express** server, which is still the production
  backend. Laravel is not in the deployed stack yet.
- `nginx.conf` proxies `/api/` and `/ai/` to Express on `:3001`. Its
  `client_max_body_size 10m` matches the Express JSON limit — mock interviews
  POST base64 audio and nginx would 413 first — and `proxy_read_timeout 300s`
  exists because model calls are slow. Keep both when repointing at Laravel.
- Accounts live in a JSON file on a Docker volume, not in the image.

**Do not delete `server/` until Laravel is deployed and confirmed serving
traffic.** Tasks 4.1 and 4.2 in `TASKS.md` sequence that cutover.

## The MCP server

`mcp/` exposes the same API to an MCP client (Claude Code, Claude Desktop,
Cowork) so an application can be tracked or a CV tailored from a conversation.
It is a **thin client** — ownership checks, validation, the status timeline and
the premium gate stay in Laravel, and no rule is reimplemented there. When an
endpoint changes shape, the matching tool in `mcp/src/tools/` changes with it.

Audio round trips (`/api/ai/behavioral/evaluate`, `/api/ai/tts`) are deliberately
not exposed: they only make sense in the browser. See `mcp/README.md`.

## Scope — this is the whole product

Five things. Anything not on this list was deliberately deleted, so do not
reintroduce it or build features that depend on it:

1. **SaaS shell** — register/login, `free` and `premium` plans, `user` and `admin`
   roles. An admin upgrades a plan by hand; there is no payment integration and
   none is planned right now.
2. **Coding practice** — software engineering only. Problem generation, AI tutor
   chat, attempt history.
3. **Job application tracker** — CRUD, statuses, interview stages, paste-a-JD
   parsing, tailored CV and cover letter, and **spreadsheet import**: drop in an
   `.xlsx`/`.xls`/`.csv` whose columns are named anything at all, an AI proposes
   the column mapping, you correct it and review the rows, and committing fills
   blanks on applications already tracked rather than duplicating them.
4. **Interview practice** — one question at a time: prompt, answer, AI feedback,
   spoken playback.
5. **Full mock interview** — multi-turn session ending in a written report.

Deleted and staying deleted: talent ranking, analytics, contacts, the Codex/rules
page, offer tools and negotiation scripts, follow-up emails, system design drills,
hunt personas and onboarding, criteria scoring, daily logs and task streaks,
the emergency modal.

> This list used to say "import/export". What was cut was the old blind bulk
> import — exact header match, a POST per row, no dedupe. Spreadsheet import as
> described in 3 above replaces it and is a first-class feature; CSV export
> stays as it is.

> `system_design` is still a valid **interview stage type** in the tracker — people
> get scheduled for one. Only the practice drill was cut.

## Conventions

- Enums live in `backend/app/Enums` and are cast on the model (`JobStatus`,
  `AccountPlan`, `AccountRole`). Each has a `values()` helper for validation rules.
- Every model has a factory. Feature tests use them rather than hand-built arrays.
- Tests must never hit the network. Bind `FakeGeminiService` for anything that
  touches a model.
- **Spreadsheet import never overwrites.** A row matching something already
  tracked fills only fields that are currently blank, and a status moves forward
  along the pipeline or not at all. Re-importing the same sheet must stay a
  no-op — `frontend/utils/importMerge.ts` owns that and its tests assert it.
  The AI only maps the sheet's *vocabulary* (`POST /api/ai/import/plan`); the
  rows are applied deterministically client-side, and its answer is treated as
  untrusted input.
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
- `server/` is the retired Express backend, kept only as a reference for porting
  prompts out of `aiHandlers.js`. It is deleted in the final wave. Do not add to it.
