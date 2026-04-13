import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fetchAdSpend } from '@/lib/windsor';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const rows = await fetchAdSpend({ from: fmt(from), to: fmt(to) });
    const supa = supabaseAdmin();
    let upserted = 0;
    for (const r of rows) {
      const { error } = await supa.from('windsor_ad_spend').upsert(
        {
          date: r.date,
          campaign_id: r.campaign_id || null,
          campaign_name: r.campaign || null,
          ad_set_id: r.adset_id || null,
          ad_id: r.ad_id || null,
          spend: r.spend || 0,
          impressions: r.impressions || 0,
          clicks: r.clicks || 0,
        },
        { onConflict: 'date,campaign_id,ad_set_id,ad_id' }
      );
      if (!error) upserted++;
    }
    return NextResponse.json({ ok: true, upserted });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
