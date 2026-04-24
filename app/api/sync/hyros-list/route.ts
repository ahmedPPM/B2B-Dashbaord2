import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hyros } from '@/lib/hyros';

export const maxDuration = 300;

// Hyros leads list — source of truth for Hyros mode filtering.
// Only includes leads from the "Marketing for Premier Pool" Facebook ad
// account (adAccountId 696535455232096). All other Hyros leads are ignored.
//
// GET  — cron-triggered (Bearer CRON_SECRET) or ?manual=1
// POST — admin seed override (x-admin-secret header)

const PPM_FB_ACCOUNT_ID = '696535455232096';

// Valid email regex — excludes phone numbers and obviously broken entries
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Known test/junk emails to exclude from the list
const JUNK_EMAILS = new Set([
  'hello@adsgorithm.com',
  'bdbsbd@gnan.com',
  'letsgo44@gmail.com',
]);

// Seed: all valid PPM-account leads confirmed for the reporting period
const SEED_EMAILS = [
  // April 23
  'info@mazzeoconstructioncc.com',
  'donza85@aol.com',
  'hicksjonathan60@gmail.com',
  'alliedprosol@outlook.com',
  'connect@lazydazepools.com',
  'michelle@livingwaterpoolsandspas.com',
  // April 22-23
  'errol@puddlepools.com',
  'acrllc@yahoo.com',
  'spt850283@gmail.com',
  'trev@poolsunder.com',
  'info@atx-pools.com',
  'peterjohnson@superiorpoolsnc.com',
  'glenthepoolman@gmail.com',
  'buildiapools@gmail.com',
  'ernie@backyardresortpools.com',
  // April 21
  'anthony.stefanelli@acepoolservicenj.com',
  'grantsid7@gmail.com',
  'landon@revxperts.com',
  'teamsmartpacc@gmail.com',
  // April 20
  'pumardz0905@gmail.com',
  'unlimitedhardscapesllc@gmail.com',
  'springpoolsspas19@gmail.com',
  'luisaguilar.88@icloud.com',
  'unitedpoolscapes@gmail.com',
  'greg@sunshinecustomhomebuilders.com',
  // April 19
  'chrisk@keithdevelopment.com',
  'info@stunningbackyards.com',
  'classicpools.val@gmail.com',
  'anthony@poseidoncustompools.com',
  'cherie@mvppoolsllc.com',
  // April 18
  'rfmazzuco@gmail.com',
  'adambeausimpson@gmail.com',
  'office@koahpools.com',
  'passionpools9@gmail.com',
  'plankeycustompools@gmail.com',
  'mark@kenspool.com',
  'john.wetzel.56@gmail.com',
  'purebluepools@cox.net',
  'info@blueskydesigncorp.com',
  'sunkissedpoolsandspas@gmail.com',
  'leonerc@hotmail.com',
  // April 17
  'shawn@championpoolsandoutdoorliving.com',
  'gghani@newaypools.com',
  'devinlindholm77@gmail.com',
  'ajace0617@gmail.com',
  'tropicalbreezecustompools@outlook.com',
  'josh@radiantbuilders.com',
  'addison@adexteriordesigns.com',
  'rick@pawleyspools.com',
  // April 16
  'cdisabatino@disabatinoinc.com',
  'freddy@greencraftcreations.com',
  'steve.morgan@sunbeltatl.com',
  'infostrongpools@gmail.com',
  // April 15
  'brightconstsol@gmail.com',
  'amcney79@gmail.com',
  'ryan@allaquapools.com',
  'jason@nplinedesign.com',
  'allfloridascreens@yahoo.com',
  'info@procontractor.org',
  // April 14
  'todd@cyberfunnels.com',
  'christianmori@rocketmail.com',
  'marcus@mvrkpools.com',
  'dennis@poollinercompany.com',
  'bill@paradisenapa.com',
  // April 13
  'saucemen@icloud.com',
  'traceybermes12@gmail.com',
  'tcaoutdoor@outlook.com',
  'michael@meadowhillconstruction.com',
  'info@aquavidapoolsandspas.com',
  // April 12
  'dustin@creativepools.co',
  'hoffaspoolsandhoneydoos@gmail.com',
  'dan@parkshorepools.com',
  'blake@reederlandscape.com',
  'christian.bagge@pahlen.se',
  'calpropoolandspa@gmail.com',
  'doug01@aquapoolcoaz.net',
  // April 11
  'amydesalme@yahoo.com',
  'albertodc29@hotmail.com',
  'marcio@azuresignature.com',
  // April 10
  'info@lussopooldesign.com',
  'alexvsantos@icloud.com',
  'tommyddelong@gmail.com',
  'gary@texaspoolwhisperer.com',
  // April 9
  'info@rightwiseenterprises.com',
  'holidaycustompools@gmail.com',
  'poolprosllc302@gmail.com',
  // April 8
  'johnle3034@yahoo.com',
  // April 7
  'colt@uspoolbuilder.com',
  'jason@boydpools.com',
  'heathglennerster@gmail.com',
  // April 6
  'thiago@greenvalueprop.com',
  'infinitypoolsandspa318@gmail.com',
];

function isPPMLead(lead: Record<string, unknown>): boolean {
  const src = (lead.firstSource || lead.lastSource || {}) as Record<string, unknown>;
  const adSource = (src.adSource || {}) as Record<string, string>;
  return adSource.adAccountId === PPM_FB_ACCOUNT_ID;
}

function isValidEmail(email: string): boolean {
  return EMAIL_RX.test(email) && !JUNK_EMAILS.has(email.toLowerCase());
}

async function markEmails(supa: ReturnType<typeof supabaseAdmin>, emails: string[]) {
  const unique = Array.from(
    new Set(emails.map((e) => e.toLowerCase().trim()).filter(isValidEmail))
  );
  let marked = 0;
  const errors: string[] = [];
  for (const email of unique) {
    const { error } = await supa
      .from('hyros_attribution')
      .upsert({ email, in_hyros_list: true, synced_at: new Date().toISOString() }, { onConflict: 'email' });
    if (error) errors.push(`${email}: ${error.message}`);
    else marked++;
  }
  return { marked, errors, unique };
}

// GET — cron-triggered or ?manual=1
export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();

  // Seed first — always works even if Hyros API is down
  const { marked: seedMarked, errors: seedErrors } = await markEmails(supa, SEED_EMAILS);

  // Pull live from Hyros API, filter to PPM Facebook account only
  const days = Number(url.searchParams.get('days') || 60);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);

  let hyrosLeads: Awaited<ReturnType<typeof hyros.listLeads>> = [];
  let apiError: string | null = null;
  try {
    hyrosLeads = await hyros.listLeads({ fromDate, toDate, maxPages: 20, pageSize: 250 });
  } catch (e) {
    apiError = String(e);
  }

  const ppmEmails: string[] = [];
  let totalFromHyros = 0;
  let filteredOut = 0;
  for (const lead of hyrosLeads) {
    totalFromHyros++;
    if (!isPPMLead(lead as Record<string, unknown>)) { filteredOut++; continue; }
    const email = (lead.email || '').toLowerCase().trim();
    if (!isValidEmail(email)) { filteredOut++; continue; }
    ppmEmails.push(email);
  }

  const { marked: apiMarked, errors: apiErrors } = await markEmails(supa, ppmEmails);

  return NextResponse.json({
    ok: true,
    range: { from: fromDate, to: toDate },
    seed_marked: seedMarked,
    seed_errors: seedErrors.slice(0, 10),
    hyros_total: totalFromHyros,
    ppm_account_leads: ppmEmails.length,
    filtered_out: filteredOut,
    api_marked: apiMarked,
    api_error: apiError,
    errors: apiErrors.slice(0, 10),
  });
}

// POST — seed from a manual list { emails: string[] } or re-apply SEED_EMAILS
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
