#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
LOG_FILE="${LOG_FILE:-$HOME/edgepredict-watchdog.log}"
MAX_SECONDS="${MAX_SECONDS:-12}"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" >> "$LOG_FILE"
}

if curl -fsS --max-time "$MAX_SECONDS" "$APP_URL/api/health/live" >/tmp/edgepredict-health.json; then
  log "ok $(tr -d '\n' </tmp/edgepredict-health.json | cut -c1-500)"
  exit 0
fi

log "health failed; restarting pm2 edgepredict"
pm2 restart edgepredict --update-env >> "$LOG_FILE" 2>&1 || {
  log "pm2 restart failed"
  exit 1
}
pm2 save >> "$LOG_FILE" 2>&1 || true
