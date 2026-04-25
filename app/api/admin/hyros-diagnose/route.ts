import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros } from '@/lib/hyros';

export const maxDuration = 300;

// Diagnostic: pull Hyros leads for a given month, show breakdown by goal/source/platform,
// cross-reference with DB, and identify missing leads.
// GET /api/admin/hyros-diagnose?from=2026-04-01&to=2026-04-30&manual=1
//
// Uses the same strict PPM FB account filter as hyros-list so counts match exactly.
const PPM_FB_ACCOUNT_ID = '696535455232096';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const fromDate = url.searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const toDate = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

  // 1. Fetch from Hyros
  let hyrosLeads: Awaited<ReturnType<typeof hyros.listLeads>> = [];
  try {
    hyrosLeads = await hyros.listLeads({ fromDate, toDate, maxPages: 20, pageSize: 250 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Hyros API: ${String(e)}` }, { status: 500 });
  }

  // 2. Extract source info for each lead
  const withSource = hyrosLeads.map((l) => {
    const src = l.firstSource || l.lastSource || {};
    return {
      email: (l.email || '').toLowerCase().trim(),
      name: `${l.firstName || ''} ${l.lastName || ''}`.trim(),
      created: l.creationDate,
      goal: (src as Record<string, { name?: string }>).goal?.name || null,
      traffic_source: (src as Record<string, { name?: string }>).trafficSource?.name || null,
      platform: (src as Record<string, { platform?: string; adSourceId?: string }>).adSource?.platform || null,
      ad_source_id: (src as Record<string, { adSourceId?: string }>).adSource?.adSourceId || null,
      ad_account_id: (src as Record<string, { adAccountId?: string }>).adSource?.adAccountId || null,
      organic: (src as Record<string, boolean>).organic || false,
      category: (src as Record<string, { name?: string }>).category?.name || null,
    };
  });

  // 3. Goal/platform breakdown
  const goalCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const l of withSource) {
    const g = l.goal || '(no goal)';
    const p = l.platform || '(no platform)';
    const s = l.traffic_source || '(no traffic source)';
    goalCounts.set(g, (goalCounts.get(g) || 0) + 1);
    platformCounts.set(p, (platformCounts.get(p) || 0) + 1);
    sourceCounts.set(s, (sourceCounts.get(s) || 0) + 1);
  }

  // 4. PPM filter — strict account ID match (same as hyros-list route)
  const ppmLeads = withSource.filter((l) => l.ad_account_id === PPM_FB_ACCOUNT_ID);

  // 5. Cross-reference with DB
  const supa = supabaseAdmin();
  const allEmails = Array.from(new Set(withSource.map((l) => l.email).filter((e) => e.includes('@'))));
  const { data: dbLeads } = allEmails.length
    ? await supa.from('leads').select('email, lead_name, date_opted_in').in('email', allEmails)
    : { data: [] };
  const dbEmailSet = new Set((dbLeads || []).map((l) => (l.email || '').toLowerCase()));

  // 6. Find missing leads (in Hyros PPM/Meta list but not in DB)
  const missingFromDB = ppmLeads.filter((l) => l.email && !dbEmailSet.has(l.email));

  // 7. Check in_hyros_list status
  const { data: hyrosRows } = allEmails.length
    ? await supa.from('hyros_attribution').select('email, in_hyros_list, is_paid_ad').in('email', allEmails)
    : { data: [] };
  const hyrosListSet = new Set((hyrosRows || []).filter((r) => r.in_hyros_list).map((r) => (r.email || '').toLowerCase()));

  const ppmInDB = ppmLeads.filter((l) => l.email && dbEmailSet.has(l.email));
  const ppmMarkedInHyrosList = ppmLeads.filter((l) => l.email && hyrosListSet.has(l.email));

  return NextResponse.json({
    ok: true,
    range: { from: fromDate, to: toDate },
    hyros_total: hyrosLeads.length,
    ppm_meta_count: ppmLeads.length,
    in_db_count: ppmInDB.length,
    marked_in_hyros_list: ppmMarkedInHyrosList.length,
    missing_from_db: missingFromDB.length,
    // Breakdown tables
    by_goal: Object.fromEntries([...goalCounts.entries()].sort((a, b) => b[1] - a[1])),
    by_platform: Object.fromEntries([...platformCounts.entries()].sort((a, b) => b[1] - a[1])),
    by_traffic_source: Object.fromEntries([...sourceCounts.entries()].sort((a, b) => b[1] - a[1])),
    // The leads not in our DB yet
    missing_leads: missingFromDB.map((l) => ({
      email: l.email,
      name: l.name,
      created: l.created,
      goal: l.goal,
      platform: l.platform,
      traffic_source: l.traffic_source,
    })),
    // All PPM leads with their DB/list status
    ppm_leads: ppmLeads.map((l) => ({
      email: l.email,
      name: l.name,
      created: l.created,
      goal: l.goal,
      platform: l.platform,
      in_db: dbEmailSet.has(l.email),
      in_hyros_list: hyrosListSet.has(l.email),
    })),
  });
}
