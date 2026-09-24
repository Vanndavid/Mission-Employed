#!/usr/bin/env bash
# Probes the live site the way a user would reach it: through Traefik, TLS and
# nginx. Run by .github/workflows/uptime.yml every 10 minutes, and safe to run
# by hand from anywhere. Prints one line per check and exits non-zero if any
# check fails, so the workflow can open or close the outage issue.
#
#   SITE=https://… scripts/uptime-check.sh
set -uo pipefail

SITE=${SITE:-https://mission-employed.vanndavidteng.com}
CERT_WARN_DAYS=${CERT_WARN_DAYS:-14}
HOST=${SITE#https://}
HOST=${HOST%%/*}
failed=0

report() { # status name detail
  printf '%-4s %-10s %s\n' "$1" "$2" "$3"
  [[ $1 == FAIL ]] && failed=1
}

# name, path, and a fixed string the body must contain.
probe() {
  local name=$1 url=$SITE$2 expect=$3 body code

  # Retry once, so a single dropped packet is not an outage.
  for attempt in 1 2; do
    body=$(curl -sS --max-time 15 -w '\n%{http_code}' "$url" 2>&1)
    code=${body##*$'\n'}
    body=${body%$'\n'*}
    [[ $code == 200 && $body == *"$expect"* ]] && break
    [[ $attempt == 1 ]] && sleep 5
  done

  if [[ $code != 200 ]]; then
    report FAIL "$name" "$url → HTTP $code $(head -c 200 <<<"$body")"
  elif [[ $body != *"$expect"* ]]; then
    report FAIL "$name" "$url → 200 but body lacks '$expect'"
  else
    report OK "$name" "$url"
  fi
}

probe spa    /                                          '<div id="root">'
probe api    /api/health                                '"status":"ok"'
probe mcp    /.well-known/oauth-protected-resource/mcp  '"resource"'

expiry=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [[ -z $expiry ]]; then
  report FAIL tls "could not read the certificate for $HOST"
else
  days=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))
  if (( days < CERT_WARN_DAYS )); then
    report FAIL tls "certificate expires in $days days ($expiry) — Traefik renewal is stuck"
  else
    report OK tls "certificate valid for $days more days"
  fi
fi

exit $failed
