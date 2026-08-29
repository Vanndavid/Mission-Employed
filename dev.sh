#!/usr/bin/env bash
# Start the Laravel API (:8000) and the Vite dev server (:3000) together.
# Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$ROOT/backend/.env" ]; then
  echo "backend/.env is missing. Run: cd backend && cp .env.example .env && php artisan key:generate" >&2
  exit 1
fi
if [ ! -f "$ROOT/backend/database/database.sqlite" ]; then
  echo "Creating backend/database/database.sqlite"
  touch "$ROOT/backend/database/database.sqlite"
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "frontend/node_modules is missing. Run: cd frontend && npm install" >&2
  exit 1
fi

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

(cd "$ROOT/backend" && php artisan serve --port=8000) &
pids+=($!)

(cd "$ROOT/frontend" && npm run dev) &
pids+=($!)

wait -n
