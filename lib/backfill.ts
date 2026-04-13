import { supabaseAdmin } from './supabase/server';
import { ghl, type GHLContact, type GHLAppointment, type GHLCall } from './ghl';
import { calculateLeadScore } from './scoring';

const BACKFILL_TAGS = ['b2b typeform optin', 'new_lead'];

export interface BackfillResult {
  totalImported: number;
  totalSkipped: number;
  totalCalls: number;
}

export function mapContactToLead(c: GHLContact): Record<string, unknown> {
  const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
  const attr = c.attributionSource || {};
  return {
    ghl_contact_id: c.id,
    date_opted_in: c.dateAdded || null,
    lead_name: name,
    phone: c.phone || null,
    email: c.email || null,
    app_grading: calculateLeadScore(c),
    campaign_id: attr.campaignId || null,
    ad_set_id: attr.adSetId || null,
    ad_id: attr.adId || null,
    campaign_name: attr.campaign || null,
    ad_set_name: attr.adSetName || null,
    ad_name: attr.adName || null,
    lead_source: c.source || attr.utmSource || null,
    lead_tag: (c.tags || [])[0] || null,
    backfilled: true,
    updated_at: new Date().toISOString(),
  };
}

export function determineCallType(
  call: GHLCall,
  lead: { intro_booked_for_date: string | null; demo_booked_for_date: string | null }
): 'intro' | 'demo' | 'other' {
  const callDate = call.dateAdded ? new Date(call.dateAdded).getTime() : 0;
  if (!callDate) return 'other';
  const diffTo = (d: string | null) =>
    d ? Math.abs(callDate - new Date(d).getTime()) : Infinity;
  const introDiff = diffTo(lead.intro_booked_for_date);
  const demoDiff = diffTo(lead.demo_booked_for_date);
  const HOUR = 3600_000;
  if (introDiff < HOUR && introDiff <= demoDiff) return 'intro';
  if (demoDiff < HOUR) return 'demo';
  return 'other';
}

async function upsertOpportunity(contactId: string, leadId: string) {
  try {
    const { opportunities } = await ghl.getOpportunityByContact(contactId);
    const supa = supabaseAdmin();
    for (const opp of opportunities || []) {
      await supa
        .from('leads')
        .update({
          pipeline_stage: opp.pipelineStageId || null,
          cash_collected: opp.monetaryValue || 0,
        })
        .eq('id', leadId);
    }
  } catch (e) {
    console.error('upsertOpportunity', contactId, e);
  }
}

async function upsertAppointments(contactId: string, leadId: string) {
  try {
    const { events } = await ghl.getAppointments(contactId);
    if (!events?.length) return;
    const intro = events.find((e) => /intro/i.test(e.title || ''));
    const demo = events.find((e) => /demo/i.test(e.title || ''));
    const patch: Record<string, unknown> = {};
    if (intro) {
      patch.intro_booked = true;
      patch.intro_created_date = intro.startTime || null;
      patch.intro_booked_for_date = intro.startTime || null;
      patch.intro_show_status = intro.appointmentStatus || null;
    }
    if (demo) {
      patch.demo_booked = true;
      patch.demo_created_date = demo.startTime || null;
      patch.demo_booked_for_date = demo.startTime || null;
      patch.demo_show_status = demo.appointmentStatus || null;
    }
    if (Object.keys(patch).length) {
      await supabaseAdmin().from('leads').update(patch).eq('id', leadId);
    }
  } catch (e) {
    console.error('upsertAppointments', contactId, e);
  }
}

export async function backfillCallData(): Promise<number> {
  const supa = supabaseAdmin();
  let totalCalls = 0;
  const { data: leads } = await supa.from('leads').select('id, ghl_contact_id, intro_booked_for_date, demo_booked_for_date');
  if (!leads) return 0;

  for (const lead of leads) {
    try {
      const { calls } = await ghl.getCalls(lead.ghl_contact_id);
      for (const call of calls || []) {
        const callId = call.id;
        if (!callId) continue;
        // Idempotent insert: skip if already present
        const { data: existing } = await supa
          .from('call_analyses')
          .select('id')
          .eq('ghl_call_id', callId)
          .maybeSingle();
        if (existing) continue;

        const callType = determineCallType(call, lead);
        await supa.from('call_analyses').insert({
          lead_id: lead.id,
          ghl_contact_id: lead.ghl_contact_id,
          ghl_call_id: callId,
          call_type: callType,
          call_date: call.dateAdded || null,
          call_duration_seconds: call.duration || null,
          call_recording_url: call.recordingUrl || null,
          raw_transcript: call.transcript || null,
        });
        totalCalls++;
      }
      await ghl.sleep(120);
    } catch (e) {
      console.error('backfillCallData', lead.ghl_contact_id, e);
    }
  }
  return totalCalls;
}

export async function runBackfill(): Promise<BackfillResult> {
  const supa = supabaseAdmin();
  const startDate = process.env.BACKFILL_START_DATE || '2026-01-01';

  const { data: run } = await supa
    .from('backfill_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  const runId = run?.id;

  let totalImported = 0;
  let totalSkipped = 0;

  try {
    for (const tag of BACKFILL_TAGS) {
      let page = 1;
      while (true) {
        const { contacts } = await ghl.getContacts({
          tags: [tag],
          startAfterDate: startDate,
          limit: 100,
          page,
        });
        if (!contacts?.length) break;

        for (const c of contacts) {
          const { data: existing } = await supa
            .from('leads')
            .select('id')
            .eq('ghl_contact_id', c.id)
            .maybeSingle();

          if (existing) {
            totalSkipped++;
            continue;
          }

          const row = mapContactToLead(c);
          const { data: inserted } = await supa
            .from('leads')
            .insert(row)
            .select('id')
            .single();
          if (inserted) {
            totalImported++;
            await upsertOpportunity(c.id, inserted.id);
            await upsertAppointments(c.id, inserted.id);
          }
          await ghl.sleep(80);
        }

        if (contacts.length < 100) break;
        page++;
      }
    }

    const totalCalls = await backfillCallData();

    if (runId) {
      await supa
        .from('backfill_runs')
        .update({
          completed_at: new Date().toISOString(),
          total_imported: totalImported,
          total_skipped: totalSkipped,
          status: 'complete',
        })
        .eq('id', runId);
    }

    return { totalImported, totalSkipped, totalCalls };
  } catch (e) {
    if (runId) {
      await supa
        .from('backfill_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'error',
          error: String(e),
        })
        .eq('id', runId);
    }
    throw e;
  }
}
