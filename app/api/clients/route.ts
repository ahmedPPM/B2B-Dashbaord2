import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Returns all "clients" — any lead with client_closed=true OR cash_collected > 0.
// Split into `from_ads` (has campaign_name or campaign_id) and `organic` (neither).
export async function GET() {
  const supa = supabaseAdmin();
  // Strict: only leads explicitly marked client_closed=true count.
  // (Synced from GHL won_client tag, or flipped manually in the UI.)
  const { data, error } = await supa
    .from('leads')
    .select('*')
    .is('deleted_at', null)
    .eq('client_closed', true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = data || [];
  const isFromAds = (l: typeof rows[number]) => {
    if (l.campaign_name || l.campaign_id) return true;
    const s = (l.lead_source || '').toLowerCase();
    return /facebook|meta|google|tiktok|instagram|youtube|paid/.test(s);
  };
  const from_ads = rows.filter(isFromAds);
  const organic = rows.filter((l) => !isFromAds(l));

  const sumCash = (arr: typeof rows) => arr.reduce((n, l) => n + (l.cash_collected || 0), 0);
  const sumMrr = (arr: typeof rows) => arr.reduce((n, l) => n + (l.contracted_mrr || 0), 0);

  return NextResponse.json({
    ok: true,
    from_ads,
    organic,
    totals: {
      all: rows.length,
      from_ads: from_ads.length,
      organic: organic.length,
      cash_all: sumCash(rows),
      cash_from_ads: sumCash(from_ads),
      cash_organic: sumCash(organic),
      mrr_all: sumMrr(rows),
      mrr_from_ads: sumMrr(from_ads),
      mrr_organic: sumMrr(organic),
    },
  });
}
