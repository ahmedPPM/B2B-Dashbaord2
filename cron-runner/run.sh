#!/bin/sh
# Fires all sync endpoints. Schedule-aware: runs hourly, calls everything,
# but each endpoint's own logic is idempotent so extra runs are safe.
# Scheduling is set in Railway (cronSchedule).

set -e
BASE="${DASHBOARD_URL:-https://ppm-b2b-dashboard-production.up.railway.app}"
AUTH="Authorization: Bearer ${CRON_SECRET}"

hit() {
  local path="$1"
  echo "=== $(date -u +%H:%M:%S) $path ==="
  curl -sS -m 300 -H "$AUTH" "${BASE}${path}" | head -c 500
  echo
}

# Every fire: GHL contacts (quick) + call transcripts (quick-ish)
hit "/api/sync/ghl-contacts"
hit "/api/sync/call-transcripts?manual=1"

# Daily-only jobs (only when it's 6 UTC hour)
HOUR=$(date -u +%H)
if [ "$HOUR" = "06" ]; then
  hit "/api/sync/windsor"
  hit "/api/sync/hyros"
fi

echo "done"
