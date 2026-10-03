# Mission: Employed

Job-hunt execution system for software engineers: coding practice with an AI
tutor, a job application tracker with tailored CVs and cover letters, one-question
interview practice, and a full spoken mock interview. Live at
<https://mission-employed.vanndavidteng.com>.

`CLAUDE.md` is the project orientation (scope, constraints, conventions),
`TASKS.md` the history and the follow-ups, and `DEPLOYMENT.md` how it ships.

## Layout

```
backend/    Laravel 12 API — PHP 8.3, SQLite, Sanctum bearer tokens (port 8000)
frontend/   React 19 + TypeScript + Vite SPA (port 3000)
mcp/        MCP server over the API, also deployed as a remote connector
scripts/    deploy.sh (runs on the server) and the uptime probe
```

## Requirements

- PHP 8.3 with `pdo_sqlite`, plus `mbstring`, `intl`, `openssl`, `tokenizer`, `xml`
- Composer 2.x
- Node.js 22 (Node 18+ works for the frontend)

### Database: SQLite only

The PHP build used for this project has `pdo_sqlite` but **not** `pdo_mysql`, so
MySQL/MariaDB cannot be used locally. `backend/.env` points `DB_CONNECTION` at
SQLite and `DB_DATABASE` at `database/database.sqlite` (a path relative to
`backend/`). Keep migrations portable — avoid MySQL-only column types and
`ALTER`-heavy migrations, since SQLite rebuilds tables to alter them.

## Setup

### Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
```

### Frontend

```bash
cd frontend
npm install
```

## Running both

Two terminals:

```bash
# 1 — API on http://localhost:8000
cd backend && php artisan serve --port=8000
```

```bash
# 2 — SPA on http://localhost:3000
cd frontend && npm run dev
```

Or start both at once with `./dev.sh` (Ctrl-C stops both).

Vite proxies `/api` to `http://localhost:8000`, so the browser only ever talks
to port 3000 in development. Smoke test the API directly:

```bash
curl http://localhost:8000/api/health   # -> {"status":"ok"}
```

## Auth

The API uses Sanctum **personal access tokens**, not cookie-based SPA sessions.
Clients send `Authorization: Bearer <token>`; the token is issued by
`$user->createToken(...)` and stored client-side by
`frontend/services/authClient.ts`. `config/sanctum.php` therefore has no
stateful domains and an empty guard list.

CORS is configured in `backend/config/cors.php` and allows the origins listed in
`FRONTEND_URL` / `FRONTEND_URLS` (default `http://localhost:3000`) with
credentials. There is no wildcard origin.

## Environment

`backend/.env.example` lists every key the API reads, including `GEMINI_API_KEY`
for the AI features. Never commit a real key —
`.env` is gitignored, `.env.example` is not.

## Tests

Work is test-driven. [`.cursor/rules/tdd.mdc`](.cursor/rules/tdd.mdc) is the
how-to — where a test goes, what to assert, and the red-green loop.

```bash
cd backend  && php artisan test    # PHPUnit, in-memory SQLite
cd frontend && npm test            # Vitest
cd frontend && npm run typecheck   # tsc --noEmit
cd frontend && npm run build       # production build
cd mcp      && npm test && npm run typecheck
```

CI (`.github/workflows/ci.yml`) runs PHPUnit, Vitest, `tsc --noEmit`, the
frontend build and the MCP tests, and on `main` deploys once they are green.
See `DEPLOYMENT.md`.
