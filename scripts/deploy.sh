#!/usr/bin/env bash
# Deploy main to production. Runs ON THE SERVER, as the forced command of the
# GitHub Actions deploy key (see DEPLOYMENT.md), or by hand:
#
#   ssh vps /home/ubuntu/traefik-projects/Mission-Employed/scripts/deploy.sh
#
# It takes no arguments and ignores $SSH_ORIGINAL_COMMAND on purpose: whoever
# holds the deploy key can make the server deploy main, and nothing else.
#
# Order matters. Images are built while the old containers keep serving, so a
# broken build costs nothing. Only then are containers replaced, and if the
# site does not come back healthy the previous commit is rebuilt and restored.
set -euo pipefail

APP_DIR=/home/ubuntu/traefik-projects/Mission-Employed
SITE=https://mission-employed.vanndavidteng.com
HEALTH_URLS=(
  "$SITE/"
  "$SITE/api/health"
  "$SITE/.well-known/oauth-protected-resource/mcp"
)
LOCK=/tmp/mission-employed-deploy.lock

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

log() {
  printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

healthy() {
  local url

  for _ in $(seq 1 20); do
    local failed=0

    for url in "${HEALTH_URLS[@]}"; do
      curl -fsS -o /dev/null --max-time 10 "$url" || failed=1
    done

    [[ $failed == 0 ]] && return 0
    sleep 3
  done

  return 1
}

exec 9>"$LOCK"

if ! flock -n 9; then
  log "another deploy is running; refusing to overlap"
  exit 75
fi

cd "$APP_DIR"

PREV=$(git rev-parse HEAD)
STAGE=fetch

rollback() {
  local status=$?

  trap - ERR
  log "FAILED during $STAGE (exit $status); restoring $PREV"
  git reset --hard -q "$PREV"

  # Containers were only touched from the `up` stage on. Before that the old
  # ones are still serving and resetting the checkout is all it takes.
  if [[ $STAGE == up || $STAGE == health ]]; then
    if ! { compose build && compose up -d --wait --remove-orphans; }; then
      log "ROLLBACK FAILED — look at the server now"
    fi
  fi

  exit "$status"
}

log "at $(git rev-parse --short HEAD); fetching main"
git fetch -q origin main

# Refuses to run over local commits or edits on the server rather than stashing
# them out of sight: a diverged checkout is something a human should look at.
git merge --ff-only -q origin/main
trap rollback ERR

NEXT=$(git rev-parse HEAD)

if [[ $NEXT == "$PREV" ]]; then
  log "already at $(git rev-parse --short HEAD); rebuilding anyway"
fi

STAGE=config
# Fails on a missing required .env key (MCP_OAUTH_SECRET is `:?`) before any
# image is built or container touched.
compose config -q

STAGE=build
log "building images"
compose build

STAGE=up
log "replacing containers"
compose up -d --wait --remove-orphans

STAGE=health
log "checking the site"

if ! healthy; then
  false
fi

trap - ERR
docker image prune -f >/dev/null
log "deployed $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
