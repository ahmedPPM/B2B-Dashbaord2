import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros } from '@/lib/hyros';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const url = new URL(req.url);
  // ?recent=true → only check leads whose date_opted_in is within the last
  // RECENT_HYROS_WINDOW_DAYS (default 3). Used by the hourly cron to keep
  // fresh leads tagged without re-scanning the full 5000-row history.
  const recent = url.searchParams.get('recent') === 'true';
  const recentDays = Number(process.env.RECENT_HYROS_WINDOW_DAYS || '3');
  const recentSince = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString();

  let query = supa
    .from('leads')
    .select('id, email')
    .not('email', 'is', null);
  if (recent) query = query.gte('date_opted_in', recentSince);
  const { data: leads, error: leadsErr } = await query.limit(5000);

  if (leadsErr) {
    return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 });
  }

  let synced = 0;
  let skipped = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const lead of leads || []) {
    const email = (lead.email || '').trim().toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }
    try {
      const attr = await hyros.getAttribution(email);
      if (!attr.raw_payload) {
        skipped++;
        continue;
      }
      const { error: upErr } = await supa.from('hyros_attribution').upsert(
        {
          lead_id: lead.id,
          email,
          revenue_attributed: attr.revenue_attributed || 0,
          first_order_date: attr.first_order_date || null,
          last_order_date: attr.last_order_date || null,
          tags: attr.tags || [],
          raw_payload: attr.raw_payload,
          organic: attr.organic ?? null,
          traffic_source: attr.traffic_source || null,
          ad_platform: attr.ad_platform || null,
          ad_name: attr.ad_name || null,
          click_date: attr.click_date || null,
          is_paid_ad: attr.is_paid_ad,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
      if (upErr) {
        errors.push({ email, error: upErr.message });
      } else {
        synced++;
      }
    } catch (e) {
      errors.push({ email, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Merge Hyros attribution back to leads where GHL attribution is missing.
  // If a lead has no campaign_name/lead_source but Hyros says is_paid_ad,
  // backfill from Hyros so the lead shows in "Ads only" views.
  let enriched = 0;
  try {
    const { data: gaps } = await supa
      .from('leads')
      .select('id, email')
      .is('campaign_name', null)
      .is('deleted_at', null)
      .not('email', 'is', null);

    for (const lead of gaps || []) {
      const email = (lead.email || '').toLowerCase();
      const { data: hyros } = await supa
        .from('hyros_attribution')
        .select('is_paid_ad, ad_platform, ad_name, traffic_source')
        .eq('email', email)
        .maybeSingle();

      if (hyros?.is_paid_ad) {
        const patch: Record<string, unknown> = {};
        if (hyros.ad_platform) patch.lead_source = hyros.ad_platform;
        else if (hyros.traffic_source) patch.lead_source = hyros.traffic_source;
        else patch.lead_source = 'Paid (Hyros)';
        if (hyros.ad_name) patch.ad_name = hyros.ad_name;
        if (Object.keys(patch).length) {
          await supa.from('leads').update(patch).eq('id', lead.id);
          enriched++;
        }
      }
    }
  } catch (e) {
    console.error('hyros→leads merge', e);
  }

  return NextResponse.json({ ok: true, synced, skipped, enriched, errors });
}
