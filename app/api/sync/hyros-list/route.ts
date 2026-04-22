import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros } from '@/lib/hyros';

export const maxDuration = 300;

// Canonical Hyros leads list — used to drive Hyros mode filtering.
// GET: sync from Hyros API (listLeads for last N days). Cron-auth required.
// POST: seed with a manual email list (admin secret required).
//
// Each email that Hyros reports as a lead gets in_hyros_list=true in
// hyros_attribution. The /api/leads route reads this flag to decide which
// leads show when the dashboard is in Hyros mode.

// Seed list from the Hyros Performance Report 03.23.2026–04.21.2026.
// These seed the DB on first run; the cron keeps the list live after that.
const SEED_EMAILS = [
  'anthony.stefanelli@acepoolservicenj.com',
  'bdbsbd@gnan.com',
  'grantsid7@gmail.com',
  'landon@revxperts.com',
  'marcus@mvrkpools.com',
  'teamsmartpacc@gmail.com',
  'info@lussopooldesign.com',
  'pumardz0905@gmail.com',
  'unlimitedhardscapesllc@gmail.com',
  'springpoolsspas19@gmail.com',
  'luisaguilar.88@icloud.com',
  'unitedpoolscapes@gmail.com',
  'greg@sunshinecustomhomebuilders.com',
  'chrisk@keithdevelopment.com',
  'info@stunningbackyards.com',
  'classicpools.val@gmail.com',
  'anthony@poseidoncustompools.com',
  'cherie@mvppoolsllc.com',
  'rfmazzuco@gmail.com',
  'adambeausimpson@gmail.com',
  'office@koahpools.com',
  'passionpools9@gmail.com',
  'doug01@aquapoolcoaz.net',
  'plankeycustompools@gmail.com',
  'mark@kenspool.com',
  'john.wetzel.56@gmail.com',
  'purebluepools@cox.net',
  'info@blueskydesigncorp.com',
  'sunkissedpoolsandspas@gmail.com',
  'leonerc@hotmail.com',
  'shawn@championpoolsandoutdoorliving.com',
  'gghani@newaypools.com',
  'devinlindholm77@gmail.com',
  'ajace0617@gmail.com',
  'tropicalbreezecustompools@outlook.com',
  'josh@radiantbuilders.com',
  'addison@adexteriordesigns.com',
  'rick@pawleyspools.com',
  'cdisabatino@disabatinoinc.com',
  'freddy@greencraftcreations.com',
  'steve.morgan@sunbeltatl.com',
  'infostrongpools@gmail.com',
  'brightconstsol@gmail.com',
  'amcney79@gmail.com',
  'ryan@allaquapools.com',
  'allfloridascreens@yahoo.com',
  'info@procontractor.org',
  'todd@cyberfunnels.com',
  'christianmori@rocketmail.com',
  'dennis@poollinercompany.com',
  'bill@paradisenapa.com',
  'saucemen@icloud.com',
  'tcaoutdoor@outlook.com',
  'michael@meadowhillconstruction.com',
  'info@aquavidapoolsandspas.com',
  'dustin@creativepools.co',
  'hoffaspoolsandhoneydoos@gmail.com',
  'dan@parkshorepools.com',
  'blake@reederlandscape.com',
  'christian.bagge@pahlen.se',
  'calpropoolandspa@gmail.com',
  'amydesalme@yahoo.com',
  'albertodc29@hotmail.com',
  'marcio@azuresignature.com',
  'alexvsantos@icloud.com',
  'gary@texaspoolwhisperer.com',
  'info@rightwiseenterprises.com',
  'holidaycustompools@gmail.com',
  'heathglennerster@gmail.com',
  'poolprosllc302@gmail.com',
  'johnle3034@yahoo.com',
  'colt@uspoolbuilder.com',
  'jason@boydpools.com',
  'thiago@greenvalueprop.com',
  'infinitypoolsandspa318@gmail.com',
  'crootekid7523@gmail.com',
  'admin@asurenet.com',
  'elitepoolmasters@gmail.com',
];

async function markEmails(supa: ReturnType<typeof supabaseAdmin>, emails: string[]) {
  const unique = Array.from(new Set(emails.map((e) => e.toLowerCase().trim()).filter((e) => e.includes('@'))));
  let marked = 0;
  const errors: string[] = [];
  for (const email of unique) {
    const { error } = await supa.from('hyros_attribution').upsert(
      { email, in_hyros_list: true, synced_at: new Date().toISOString() },
      { onConflict: 'email' },
    );
    if (error) errors.push(`${email}: ${error.message}`);
    else marked++;
  }
  return { marked, errors };
}

// GET — cron-triggered sync from Hyros API
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const days = Number(url.searchParams.get('days') || 60);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);

  let hyrosLeads: Awaited<ReturnType<typeof hyros.listLeads>> = [];
  try {
    hyrosLeads = await hyros.listLeads({ fromDate, toDate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `hyros listLeads: ${String(e)}` }, { status: 500 });
  }

  const hyrosEmails = hyrosLeads
    .map((l) => (l.email || '').toLowerCase().trim())
    .filter((e) => e.includes('@'));

  // Always include the seed list so the initial cohort is never dropped.
  const allEmails = [...new Set([...hyrosEmails, ...SEED_EMAILS])];
  const { marked, errors } = await markEmails(supa, allEmails);

  return NextResponse.json({
    ok: true,
    from: fromDate,
    to: toDate,
    hyros_api_leads: hyrosLeads.length,
    total_marked: marked,
    errors: errors.slice(0, 20),
  });
}

// POST — seed from a manual list  { emails: string[] }  or re-apply SEED_EMAILS
export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();
  let emails: string[] = SEED_EMAILS;
  try {
    const body = await req.json();
    if (Array.isArray(body?.emails) && body.emails.length) emails = body.emails;
  } catch { /* use seed list */ }

  const { marked, errors } = await markEmails(supa, emails);
  return NextResponse.json({ ok: true, marked, errors: errors.slice(0, 20) });
}
