import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ghl } from '@/lib/ghl';
import { determineCallType } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

export const maxDuration = 300;

// Pulls call messages + transcriptions from GHL for leads that have had
// activity in the last 45 days, inserting any new call_analyses rows so the
// Claude analysis cron picks them up on its next run.
export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const supa = supabaseAdmin();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await supa
    .from('leads')
    .select('id, ghl_contact_id, intro_booked_for_date, demo_booked_for_date, updated_at')
    .not('ghl_contact_id', 'is', null)
    .gte('updated_at', since)
    .limit(500);

  let scanned = 0;
  let inserted = 0;
  for (const lead of leads || []) {
    scanned++;
    try {
      const { calls } = await ghl.getCalls(lead.ghl_contact_id as string);
      for (const call of calls || []) {
        const ghlCallId = call.id;
        const { data: existing } = await supa
          .from('call_analyses')
          .select('id, raw_transcript')
          .eq('ghl_call_id', ghlCallId)
          .maybeSingle();
        if (existing?.raw_transcript) continue;

        const transcript = await ghl.getCallTranscription(ghlCallId);
        if (!transcript) continue;

        const callType = determineCallType(call, {
          intro_booked_for_date: lead.intro_booked_for_date as string | null,
          demo_booked_for_date: lead.demo_booked_for_date as string | null,
        });

        if (existing) {
          await supa
            .from('call_analyses')
            .update({ raw_transcript: transcript, analyzed_at: null })
            .eq('id', existing.id);
        } else {
          await supa.from('call_analyses').insert({
            lead_id: lead.id,
            ghl_contact_id: lead.ghl_contact_id,
            ghl_call_id: ghlCallId,
            call_type: callType,
            call_date: call.dateAdded || new Date().toISOString(),
            raw_transcript: transcript,
          });
        }
        inserted++;
      }
      await ghl.sleep(80);
    } catch (e) {
      console.error('calls-from-ghl lead', lead.ghl_contact_id, e);
    }
  }

  return NextResponse.json({ ok: true, scanned, inserted });
}
