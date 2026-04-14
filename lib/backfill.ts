import { supabaseAdmin } from './supabase/server';
import { ghl, type GHLContact, type GHLAppointment, type GHLCall } from './ghl';
import { calculateLeadScore } from './scoring';
import { backfillCalendly } from './calendly';

const BACKFILL_TAGS = ['b2b typeform optin', 'new_lead'];

function introCalendarIds(): string[] {
  return (process.env.GHL_INTRO_CALENDAR_IDS || '0cPxjhApUzQ83lW2bQmt,vgek7QKnwcUvQcNIbepL')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function demoCalendarIds(): string[] {
  return (process.env.GHL_DEMO_CALENDAR_IDS || 'R28qx4Lw05GV8GJEiCUe')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const INTRO_TRANSCRIPT_FIELD_KEYS = ['intro_call_transcripts', 'intro_call_transcript'];

export interface BackfillResult {
  totalImported: number;
  totalSkipped: number;
  totalCalls: number;
  totalAppointments: number;
  calendlyUpdated: number;
}

export function mapContactToLead(c: GHLContact): Record<string, unknown> {
  const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
  const attr = c.attributionSource || {};
  return {
    ghl_contact_id: c.id,
    date_opted_in: c.dateAdded || null,
    lead_name: name,
    phone: c.phone || null,
    email: c.email ? c.email.toLowerCase() : null,
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

export function classifyAppointment(
  evt: GHLAppointment
): 'intro' | 'demo' | null {
  const cid = evt.calendarId || '';
  if (introCalendarIds().includes(cid)) return 'intro';
  if (demoCalendarIds().includes(cid)) return 'demo';
  const title = evt.title || '';
  if (/demo/i.test(title)) return 'demo';
  if (/intro/i.test(title)) return 'intro';
  return null;
}

export function determineCallType(
  call: GHLCall,
  lead: { intro_booked_for_date: string | null; demo_booked_for_date: string | null }
): 'intro' | 'demo' | 'other' {
  const callDate = call.dateAdded ? new Date(call.dateAdded).getTime() : 0;
  if (!callDate) return 'other';
  const diffTo = (d: string | null) => (d ? Math.abs(callDate - new Date(d).getTime()) : Infinity);
  const introDiff = diffTo(lead.intro_booked_for_date);
  const demoDiff = diffTo(lead.demo_booked_for_date);
  const HOUR = 3600_000;
  if (introDiff < HOUR && introDiff <= demoDiff) return 'intro';
  if (demoDiff < HOUR) return 'demo';
  return 'other';
}

/**
 * Repair pre-2026 date_opted_in. A GHL contact's dateAdded can predate the
 * 2026 B2B form opt-in (contact existed as cold lead before). Use the first
 * 2026 appointment or call as the true opt-in proxy; fall back to Jan 1.
 */
export async function repairPre2026OptInDates(): Promise<{ repaired: number; defaulted: number }> {
  const supa = supabaseAdmin();
  const cutoff = process.env.BACKFILL_START_DATE || '2026-01-01';
  const { data: leads } = await supa
    .from('leads')
    .select('id, intro_booked_for_date, intro_created_date, demo_booked_for_date')
    .lt('date_opted_in', cutoff);
  let repaired = 0;
  let defaulted = 0;
  for (const l of leads || []) {
    const candidates = [l.intro_created_date, l.intro_booked_for_date, l.demo_booked_for_date]
      .filter((d): d is string => !!d && new Date(d).getTime() >= new Date(cutoff).getTime())
      .sort();
    if (candidates[0]) {
      await supa.from('leads').update({ date_opted_in: candidates[0] }).eq('id', l.id);
      repaired++;
      continue;
    }
    const { data: calls } = await supa
      .from('call_analyses')
      .select('call_date')
      .eq('lead_id', l.id)
      .not('call_date', 'is', null)
      .gte('call_date', cutoff)
      .order('call_date')
      .limit(1);
    const firstCall = calls?.[0]?.call_date;
    if (firstCall) {
      await supa.from('leads').update({ date_opted_in: firstCall }).eq('id', l.id);
      repaired++;
    } else {
      await supa.from('leads').update({ date_opted_in: `${cutoff}T00:00:00Z` }).eq('id', l.id);
      defaulted++;
    }
  }
  return { repaired, defaulted };
}

/**
 * Post-pass: pick each lead's longest call near an intro/demo booking as the
 * canonical intro/demo call. Runs after all calls are imported.
 * - Intro window: [booking - 30min, min(demo_booking, booking + 48h)]
 * - Demo window: [booking - 30min, booking + 48h]
 * - Min call duration: 60s (filters voicemails + short dials)
 */
export async function reclassifyCallTypesForLeads(): Promise<{ intro: number; demo: number }> {
  const supa = supabaseAdmin();
  const { data: leads } = await supa
    .from('leads')
    .select('id, intro_booked_for_date, demo_booked_for_date');
  let intro = 0;
  let demo = 0;
  for (const l of leads || []) {
    const { data: calls } = await supa
      .from('call_analyses')
      .select('id, call_date, call_duration_seconds')
      .eq('lead_id', l.id)
      .gte('call_duration_seconds', 60);
    if (!calls?.length) continue;

    const introT = l.intro_booked_for_date ? new Date(l.intro_booked_for_date).getTime() : null;
    const demoT = l.demo_booked_for_date ? new Date(l.demo_booked_for_date).getTime() : null;

    if (introT) {
      const end = Math.min(demoT || Infinity, introT + 48 * 3600_000);
      const picks = calls
        .filter((c) => {
          const t = c.call_date ? new Date(c.call_date).getTime() : 0;
          return t >= introT - 30 * 60_000 && t <= end;
        })
        .sort((a, b) => (b.call_duration_seconds || 0) - (a.call_duration_seconds || 0));
      if (picks[0]) {
        await supa.from('call_analyses').update({ call_type: 'intro' }).eq('id', picks[0].id);
        intro++;
      }
    }
    if (demoT) {
      const picks = calls
        .filter((c) => {
          const t = c.call_date ? new Date(c.call_date).getTime() : 0;
          return t >= demoT - 30 * 60_000 && t <= demoT + 48 * 3600_000;
        })
        .sort((a, b) => (b.call_duration_seconds || 0) - (a.call_duration_seconds || 0));
      if (picks[0]) {
        await supa.from('call_analyses').update({ call_type: 'demo' }).eq('id', picks[0].id);
        demo++;
      }
    }
  }
  return { intro, demo };
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

async function fetchAllAppointmentsForContact(contactId: string): Promise<GHLAppointment[]> {
  const out: GHLAppointment[] = [];
  try {
    const { events } = await ghl.getAppointments(contactId);
    for (const e of events || []) out.push(e);
  } catch (e) {
    console.error('getAppointments', contactId, e);
  }
  return out;
}

async function fetchCalendarWindow(): Promise<GHLAppointment[]> {
  // Pull all events across configured calendars once, across backfill window.
  const startStr = process.env.BACKFILL_START_DATE || '2026-01-01';
  const startMs = new Date(`${startStr}T00:00:00Z`).getTime();
  const endMs = Date.now() + 365 * 24 * 3600_000; // include future bookings
  const calIds = [...introCalendarIds(), ...demoCalendarIds()];
  const all: GHLAppointment[] = [];
  for (const id of calIds) {
    try {
      const { events } = await ghl.getCalendarEvents(id, startMs, endMs);
      for (const e of events || []) all.push(e);
    } catch (e) {
      console.error('getCalendarEvents', id, e);
    }
  }
  return all;
}

export async function upsertAppointmentsForLead(
  contactId: string,
  leadId: string,
  events: GHLAppointment[]
): Promise<number> {
  try {
    if (!events.length) return 0;
    const patch: Record<string, unknown> = {};
    // Pick latest intro + latest demo
    const intros = events.filter((e) => classifyAppointment(e) === 'intro');
    const demos = events.filter((e) => classifyAppointment(e) === 'demo');
    const byStartDesc = (a: GHLAppointment, b: GHLAppointment) =>
      new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime();
    intros.sort(byStartDesc);
    demos.sort(byStartDesc);
    const intro = intros[0];
    const demo = demos[0];
    if (intro) {
      patch.intro_booked = true;
      patch.intro_created_date = (intro.dateAdded as string) || intro.startTime || null;
      patch.intro_booked_for_date = intro.startTime || null;
      patch.intro_show_status = intro.appointmentStatus || null;
    }
    if (demo) {
      patch.demo_booked = true;
      patch.demo_created_date = (demo.dateAdded as string) || demo.startTime || null;
      patch.demo_booked_for_date = demo.startTime || null;
      patch.demo_show_status = demo.appointmentStatus || null;
    }
    if (Object.keys(patch).length) {
      await supabaseAdmin().from('leads').update(patch).eq('id', leadId);
      return (intro ? 1 : 0) + (demo ? 1 : 0);
    }
    return 0;
  } catch (e) {
    console.error('upsertAppointmentsForLead', contactId, e);
    return 0;
  }
}

async function persistIntroTranscriptFromCustomField(
  contactId: string,
  leadId: string
): Promise<boolean> {
  try {
    const { contact } = await ghl.getContact(contactId);
    const fields = (contact.customFields || []) as Array<{ id?: string; key?: string; value?: unknown }>;
    const hit = fields.find((f) => {
      const k = (f.key || '').toLowerCase();
      return INTRO_TRANSCRIPT_FIELD_KEYS.includes(k);
    });
    const transcript = hit?.value ? String(hit.value).trim() : '';
    if (!transcript) return false;

    const supa = supabaseAdmin();
    const callId = `cf-${contactId}`;
    const { data: existing } = await supa
      .from('call_analyses')
      .select('id, raw_transcript')
      .eq('ghl_call_id', callId)
      .maybeSingle();
    if (existing) {
      if (existing.raw_transcript !== transcript) {
        await supa.from('call_analyses').update({ raw_transcript: transcript }).eq('id', existing.id);
      }
      return true;
    }
    await supa.from('call_analyses').insert({
      lead_id: leadId,
      ghl_contact_id: contactId,
      ghl_call_id: callId,
      call_type: 'intro',
      call_date: null,
      raw_transcript: transcript,
    });
    return true;
  } catch (e) {
    console.error('persistIntroTranscriptFromCustomField', contactId, e);
    return false;
  }
}

export async function backfillCallData(): Promise<number> {
  const supa = supabaseAdmin();
  let totalCalls = 0;
  const { data: leads } = await supa
    .from('leads')
    .select('id, ghl_contact_id, intro_booked_for_date, demo_booked_for_date');
  if (!leads) return 0;

  for (const lead of leads) {
    try {
      // Custom-field transcript (cheap, one contact fetch)
      const cfInserted = await persistIntroTranscriptFromCustomField(lead.ghl_contact_id, lead.id);
      if (cfInserted) totalCalls++;

      // Messages-based call extraction
      const { calls } = await ghl.getCalls(lead.ghl_contact_id);
      for (const call of calls || []) {
        const callId = call.id;
        if (!callId) continue;
        const { data: existing } = await supa
          .from('call_analyses')
          .select('id, raw_transcript')
          .eq('ghl_call_id', callId)
          .maybeSingle();

        // Fetch transcript (if any) from GHL's transcription endpoint.
        let transcript: string | null = call.transcript || null;
        if (!transcript) {
          transcript = await ghl.getCallTranscription(callId);
        }

        if (existing) {
          if (transcript && existing.raw_transcript !== transcript) {
            await supa
              .from('call_analyses')
              .update({ raw_transcript: transcript, analyzed_at: null })
              .eq('id', existing.id);
            totalCalls++;
          }
          continue;
        }

        const callType = determineCallType(call, lead);
        await supa.from('call_analyses').insert({
          lead_id: lead.id,
          ghl_contact_id: lead.ghl_contact_id,
          ghl_call_id: callId,
          call_type: callType,
          call_date: call.dateAdded || null,
          call_duration_seconds: call.duration || null,
          call_recording_url: call.recordingUrl || null,
          raw_transcript: transcript,
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

async function importContactIfNew(c: GHLContact): Promise<'imported' | 'skipped'> {
  const supa = supabaseAdmin();
  const { data: existing } = await supa
    .from('leads')
    .select('id')
    .eq('ghl_contact_id', c.id)
    .maybeSingle();
  if (existing) return 'skipped';
  const row = mapContactToLead(c);
  const { data: inserted } = await supa.from('leads').insert(row).select('id').single();
  if (inserted) {
    await upsertOpportunity(c.id, inserted.id);
  }
  return 'imported';
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
    // Pass 1: tagged contacts (primary path)
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
          const res = await importContactIfNew(c);
          if (res === 'imported') totalImported++;
          else totalSkipped++;
          await ghl.sleep(60);
        }
        if (contacts.length < 100) break;
        page++;
      }
    }

    // Appointments: pull from all configured calendars (one shot) then distribute.
    let totalAppointments = 0;
    const allEvents = await fetchCalendarWindow();
    const eventsByContact = new Map<string, GHLAppointment[]>();
    for (const e of allEvents) {
      const cid = e.contactId || '';
      if (!cid) continue;
      const arr = eventsByContact.get(cid) || [];
      arr.push(e);
      eventsByContact.set(cid, arr);
    }

    // (Pass 1.5 removed) — dashboard is strictly tag-sourced
    // (b2b typeform optin / new_lead). Calendar-derived contacts without
    // these tags are excluded to match the sheet.
    const { data: allLeads } = await supa.from('leads').select('id, ghl_contact_id');
    for (const lead of allLeads || []) {
      const evts = eventsByContact.get(lead.ghl_contact_id) || [];
      // Fallback to contact-scoped appointments if calendar pull empty for this lead
      const withFallback = evts.length ? evts : await fetchAllAppointmentsForContact(lead.ghl_contact_id);
      totalAppointments += await upsertAppointmentsForLead(lead.ghl_contact_id, lead.id, withFallback);
      await ghl.sleep(30);
    }

    // Calls (messages + custom field transcripts)
    const totalCalls = await backfillCallData();

    // Reclassify intro/demo based on duration + booking window
    try {
      await reclassifyCallTypesForLeads();
    } catch (e) {
      console.error('reclassifyCallTypesForLeads', e);
    }

    // Repair pre-2026 date_opted_in using first 2026 appointment or call.
    // GHL contact dateAdded can be years old if the contact existed prior to
    // re-opting into the B2B form in 2026.
    try {
      await repairPre2026OptInDates();
    } catch (e) {
      console.error('repairPre2026OptInDates', e);
    }

    // Calendly intros
    let calendlyUpdated = 0;
    try {
      calendlyUpdated = await backfillCalendly();
    } catch (e) {
      console.error('backfillCalendly', e);
    }

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

    return { totalImported, totalSkipped, totalCalls, totalAppointments, calendlyUpdated };
  } catch (e) {
    console.error('runBackfill', e);
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
