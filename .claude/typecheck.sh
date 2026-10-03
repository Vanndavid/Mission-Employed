#!/usr/bin/env bash
# PostToolUse hook: after any edit to a TypeScript file under frontend/, run the
# type-check and hand the errors back to Claude. CLAUDE.md documents
# `npx tsc --noEmit` as part of the test command; a hook makes it deterministic
# rather than advisory, so a broken type never survives to the next prompt.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-/home/vanndavid/code/Mission-Employed}"

# The tool call arrives as JSON on stdin; we only care about the edited path.
file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$file" in
  "$root"/frontend/*.ts|"$root"/frontend/*.tsx) ;;
  *) exit 0 ;;
esac

[ -d "$root/frontend/node_modules" ] || exit 0

out=$(cd "$root/frontend" && npx tsc --noEmit 2>&1)
[ -z "$out" ] && exit 0

# Exit 2 is the contract for "feed stderr back to the model as a blocking error".
printf 'tsc --noEmit failed after editing %s:\n\n%s\n' "$file" "$out" >&2
exit 2
