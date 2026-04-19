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

# Every fire: GHL contacts (quick) + pull any new GHL call transcripts +
# analyse pending transcripts + tag fresh leads with Hyros attribution +
# enrichment sweep.
hit "/api/sync/ghl-contacts"
hit "/api/sync/calls-from-ghl"
hit "/api/sync/call-transcripts?manual=1"
# Incremental Hyros pass: only checks leads from the last few days so the
# "Hyros ✓" filter stays fresh without the 5000-row daily sweep.
hit "/api/sync/hyros?recent=true"
# Per-lead GHL sync: opportunities (pipeline_stage, client_closed),
# appointments (intro/demo + closer names), custom fields (cash_collected,
# contracted_mrr). Up to 5 min.
hit "/api/sync/enrich"

# Daily-only jobs (only when it's 6 UTC hour)
HOUR=$(date -u +%H)
if [ "$HOUR" = "06" ]; then
  hit "/api/sync/windsor"
  hit "/api/sync/hyros"
  # Reconciliation catches anything webhook + hourly cron missed in the
  # trailing 7 days. GHL-driven first, then Hyros-driven — the Hyros pass
  # closes the case where Hyros saw a paid opt-in that never made it into GHL.
  hit "/api/sync/reconcile"
  hit "/api/sync/hyros-reconcile"
fi

echo "done"
