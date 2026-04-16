import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl, type GHLContact } from '@/lib/ghl';
import { mapContactToLead } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';
import { isFromAds } from '@/lib/is-paid';

// Discover GHL contacts that came from Meta/Facebook/paid ads but aren't
// in our `leads` table yet — regardless of tag. Used to backfill leads
// that predate the current tagging scheme.
//
// Heuristic for "from ads":
//   - contact.attributionSource.campaignId exists (Meta pixel attribution)
//   - contact.source matches /facebook|meta|fb|google|tiktok|ads/i
//   - contact.attributionSource.utmSource matches paid platforms
//
// Pulls contacts added from BACKFILL_START_DATE onward, paginates all pages.
export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const supa = supabaseAdmin();
  const startDate = process.env.BACKFILL_START_DATE || '2026-01-01';
  const dryRun = new URL(req.url).searchParams.get('dry') === 'true';

  // Existing contact IDs so we don't re-insert
  const { data: existing } = await supa
    .from('leads')
    .select('ghl_contact_id')
    .not('ghl_contact_id', 'is', null);
  const existingIds = new Set((existing || []).map((r) => r.ghl_contact_id as string));

  let imported = 0;
  let skipped_existing = 0;
  let skipped_not_ads = 0;
  let scanned = 0;
  const sampleImported: Array<{ id: string; name: string; source: string | null; campaign: string | null }> = [];

  try {
    let page = 1;
    while (true) {
      // Pull all contacts by dateAdded window. No tag filter.
      const { contacts } = await ghl.searchContacts({
        startAfterDate: startDate,
        page,
        limit: 100,
      });
      if (!contacts?.length) break;

      for (const c of contacts) {
        scanned++;
        if (existingIds.has(c.id)) {
          skipped_existing++;
          continue;
        }

        // Build the same fields mapContactToLead produces so we can test
        // them against the "from ads" heuristic before inserting.
        const attr = c.attributionSource || {};
        const paidFields = {
          campaign_id: attr.campaignId || null,
          campaign_name: attr.campaign || null,
          lead_source: c.source || attr.utmSource || null,
        };
        if (!isFromAds(paidFields)) {
          skipped_not_ads++;
          continue;
        }

        if (!dryRun) {
          const row = mapContactToLead(c);
          const { error } = await supa.from('leads').insert(row);
          if (!error) {
            imported++;
            existingIds.add(c.id);
          }
        } else {
          imported++; // count would-be
        }

        if (sampleImported.length < 30) {
          sampleImported.push({
            id: c.id,
            name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '(unnamed)',
            source: (c.source || attr.utmSource || null) as string | null,
            campaign: (attr.campaign || null) as string | null,
          });
        }

        await ghl.sleep(40);
      }

      if (contacts.length < 100) break;
      page++;
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      scanned,
      imported,
      skipped_existing,
      skipped_not_ads,
      sample_imported: sampleImported,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
