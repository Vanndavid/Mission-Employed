#!/usr/bin/env bash
# SessionStart hook: inject a compact digest of TASKS.md so the live task list
# is in context without anyone having to ask for it. CLAUDE.md still points at
# the full file, which holds the per-task copy-paste briefs.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-/home/vanndavid/code/Mission-Employed}"
tasks="$root/TASKS.md"
[ -f "$tasks" ] || exit 0

digest=$(awk '
  /^\*\*Branch:\*\*/ { gsub(/\*\*/, ""); print; next }
  /^## /            { wave = $0; sub(/^## /, "", wave); next }
  /^### /           { heading = $0; sub(/^### /, "", heading); shown = 0; next }
  /^- \[ \]/ {
    if (!shown) {
      if (wave != lastwave) { print ""; print wave; lastwave = wave }
      note = $0; sub(/^- \[ \] /, "", note); gsub(/\*\*/, "", note)
      print "  - " heading "  (" note ")"
      shown = 1
    }
  }
' "$tasks")

[ -n "$digest" ] || exit 0

# additionalContext feeds the model; systemMessage is what the user actually
# sees printed in the terminal. Emit both so the digest is not invisible.
printf 'TASKS.md — open work (full briefs are in %s):\n\n%s\n' "$tasks" "$digest" \
  | jq -Rs '{
      hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .},
      systemMessage: .
    }'
