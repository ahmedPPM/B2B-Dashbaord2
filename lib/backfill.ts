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

/**
 * Returns the timestamp that should be shown as "opt-in date".
 *
 * Re-engaging contacts (existing GHL record, `new_lead` tag re-added months/years
 * later) have an ancient `dateAdded` but a fresh `dateUpdated`. Treat the update
 * time as opt-in in that case so the UI shows them as fresh leads.
 */
export function freshOptInDate(c: GHLContact): string | null {
  const added = c.dateAdded || null;
  const updated = c.dateUpdated || null;
  if (!added) return updated;
  if (!updated) return added;
  const hasNewLead = (c.tags || []).some((t) => t === 'new_lead');
  if (!hasNewLead) return added;
  const addedMs = new Date(added).getTime();
  const updatedMs = new Date(updated).getTime();
  // If the gap is >24h, this contact is a re-engager, not a fresh import.
  if (updatedMs - addedMs > 24 * 60 * 60 * 1000) return updated;
  return added;
}

export function mapContactToLead(c: GHLContact): Record<string, unknown> {
  const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
  const attr = c.attributionSource || {};
  return {
    ghl_contact_id: c.id,
    date_opted_in: freshOptInDate(c),
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
    lead_source: c.source || attr.utmSource || 'Organic',
    lead_tag: (c.tags || [])[0] || null,
    tags: Array.isArray(c.tags) && c.tags.length ? c.tags : null,
    assigned_user_id: c.assignedTo || null,
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

// GHL user IDs are 24-char hex-ish strings (objectId-like).
// Use this to detect "unresolved" values in name columns.
const looksLikeGhlUserId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9]{20,30}$/.test(v);

let userMapCache: { at: number; map: Record<string, string> } | null = null;
async function getGhlUsersMap(): Promise<Record<string, string>> {
  // 10-minute cache so the webhook isn't hammering /users
  if (userMapCache && Date.now() - userMapCache.at < 10 * 60 * 1000) return userMapCache.map;
  const map: Record<string, string> = {};
  const { users } = await ghl.getUsers();
  for (const u of users || []) {
    const name = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id;
    map[u.id] = name;
  }
  userMapCache = { at: Date.now(), map };
  return map;
}

// Exported helper: resolve one user ID to its display name (cached).
export async function resolveGhlUserName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  if (!looksLikeGhlUserId(userId)) return userId; // already a name
  try {
    const map = await getGhlUsersMap();
    return map[userId] || userId;
  } catch {
    return userId;
  }
}

/**
 * Resolve GHL user IDs → display names across lead columns:
 *   - assigned_user_id → assigned_user_name
 *   - intro_closer (overwritten in place if it's a raw ID)
 *   - demo_assigned_closer (overwritten in place if it's a raw ID)
 */
export async function resolveAssignedUserNames(): Promise<number> {
  const supa = supabaseAdmin();
  let usersMap: Record<string, string>;
  try {
    usersMap = await getGhlUsersMap();
  } catch (e) {
    console.error('resolveAssignedUserNames: getUsers failed', e);
    return 0;
  }

  const { data: leads } = await supa
    .from('leads')
    .select('id, assigned_user_id, assigned_user_name, intro_closer, demo_assigned_closer');

  let updated = 0;
  for (const l of leads || []) {
    const patch: Record<string, string | null> = {};

    const aName = usersMap[l.assigned_user_id as string];
    if (aName && aName !== l.assigned_user_name) patch.assigned_user_name = aName;

    if (looksLikeGhlUserId(l.intro_closer)) {
      const n = usersMap[l.intro_closer as string];
      if (n) patch.intro_closer = n;
    }
    if (looksLikeGhlUserId(l.demo_assigned_closer)) {
      const n = usersMap[l.demo_assigned_closer as string];
      if (n) patch.demo_assigned_closer = n;
    }

    if (Object.keys(patch).length) {
      await supa.from('leads').update(patch).eq('id', l.id);
      updated++;
    }
  }
  return updated;
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
  const WEEK = 7 * 24 * 3600_000;
  for (const l of leads || []) {
    // Pull ALL calls for this lead — don't filter by duration upfront (intro calls
    // can be short; voicemails without duration should still be considered).
    const { data: calls } = await supa
      .from('call_analyses')
      .select('id, call_date, call_duration_seconds, call_type')
      .eq('lead_id', l.id);
    if (!calls?.length) continue;

    const introT = l.intro_booked_for_date ? new Date(l.intro_booked_for_date).getTime() : null;
    const demoT = l.demo_booked_for_date ? new Date(l.demo_booked_for_date).getTime() : null;

    const pickBest = (center: number, windowMs: number, excludeId?: string) => {
      const candidates = calls
        .filter((c) => c.id !== excludeId)
        .map((c) => ({ c, t: c.call_date ? new Date(c.call_date).getTime() : 0 }))
        .filter((x) => x.t > 0 && Math.abs(x.t - center) <= windowMs);
      if (!candidates.length) return null;
      // Prefer longest duration; fallback to closest in time if durations null.
      candidates.sort((a, b) => {
        const da = a.c.call_duration_seconds || 0;
        const db = b.c.call_duration_seconds || 0;
        if (db !== da) return db - da;
        return Math.abs(a.t - center) - Math.abs(b.t - center);
      });
      return candidates[0].c;
    };

    let demoPick: string | undefined;
    if (demoT) {
      const pick = pickBest(demoT, WEEK);
      if (pick) {
        await supa.from('call_analyses').update({ call_type: 'demo' }).eq('id', pick.id);
        demoPick = pick.id;
        demo++;
      }
    }
    if (introT) {
      const pick = pickBest(introT, WEEK, demoPick);
      if (pick) {
        await supa.from('call_analyses').update({ call_type: 'intro' }).eq('id', pick.id);
        intro++;
      }
    }
  }
  return { intro, demo };
}

async function upsertOpportunity(contactId: string, leadId: string) {
  // NOTE: cash_collected + contracted_mrr come from GHL CONTACT custom fields
  //  (not opportunity.monetaryValue). See enrichLeadFromGhl().
  // This function only syncs pipeline_stage + closed-won flags from the latest opportunity.
  try {
    const { opportunities } = await ghl.getOpportunityByContact(contactId);
    if (!opportunities?.length) return;
    // Use the most recently updated opportunity for stage + status
    const sorted = opportunities.slice().sort(
      (a, b) => new Date((b as Record<string, string>).updatedAt || (b as Record<string, string>).createdAt || 0).getTime()
             - new Date((a as Record<string, string>).updatedAt || (a as Record<string, string>).createdAt || 0).getTime()
    );
    const latest = sorted[0];
    const patch: Record<string, unknown> = {};
    if (latest.pipelineStageId) patch.pipeline_stage = latest.pipelineStageId;
    if (latest.status === 'won') {
      patch.client_closed = true;
      const when = (latest as Record<string, string>).updatedAt || (latest as Record<string, string>).createdAt;
      if (when) patch.client_closed_date = when;
    }
    if (Object.keys(patch).length) {
      await supabaseAdmin().from('leads').update(patch).eq('id', leadId);
    }
  } catch (e) {
    console.error('upsertOpportunity', contactId, e);
  }
}

// GHL custom field IDs for revenue tracking.
// Keys map to the `{{ contact.X }}` merge tokens used in GHL templates.
const CF_IDS = {
  cash_collected: 'wAEqpt1dcDftV2HqCGvA',      // contact.cash_collected (MONETORY)
  three_month_payment: 'tV6DGPGXgVTFiYle9RoQ', // contact.3_month_payment — new offer
  total_contract_revenue: 'OvIIizAHQW9aaciDuLaA', // contact.total_contract_revenue — old offer
};

function pickNumericCustomField(contact: GHLContact, cfId: string): number | null {
  const f = (contact.customFields || []).find((x) => x.id === cfId);
  if (!f) return null;
  const n = Number(f.value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Enrich a single lead from GHL: custom fields + opportunities + appointments.
 * Idempotent — safe to call repeatedly on the same lead.
 *
 * - cash_collected   ← contact.cash_collected
 * - contracted_mrr   ← contact.3_month_payment  (prefer new offer)
 *                   OR contact.total_contract_revenue  (fallback old offer)
 * - pipeline_stage   ← latest opportunity.pipelineStageId
 * - client_closed    ← latest opportunity.status === 'won'
 * - intro/demo fields + closer names ← from appointments
 */
/**
 * Look up a lead by GHL contact id; if none exists, fetch the contact from GHL
 * and upsert it as a lead. Returns the lead's uuid (or null on failure).
 *
 * Used by the Calendly / Appointment / Note webhooks so an event that arrives
 * before the lead webhook has landed doesn't get silently dropped.
 */
export async function ensureLeadForContact(contactId: string): Promise<string | null> {
  const supa = supabaseAdmin();
  const { data: existing } = await supa.from('leads').select('id').eq('ghl_contact_id', contactId).maybeSingle();
  if (existing) return existing.id as string;
  try {
    const { contact } = await ghl.getContact(contactId);
    if (!contact?.id) return null;
    const row = mapContactToLead(contact);
    const { data: inserted, error } = await supa
      .from('leads')
      .upsert(row, { onConflict: 'ghl_contact_id' })
      .select('id')
      .single();
    if (error || !inserted) return null;
    return inserted.id as string;
  } catch (e) {
    console.error('ensureLeadForContact', contactId, e);
    return null;
  }
}

/**
 * Same thing keyed by email — Calendly doesn't send a contactId.
 */
export async function ensureLeadForEmail(email: string): Promise<string | null> {
  const e = email.toLowerCase();
  const supa = supabaseAdmin();
  const { data: existing } = await supa.from('leads').select('id').eq('email', e).maybeSingle();
  if (existing) return existing.id as string;
  try {
    const { contacts } = await ghl.searchContactByEmail(e);
    const c = contacts?.[0];
    if (!c?.id) return null;
    const row = mapContactToLead(c);
    const { data: inserted, error } = await supa
      .from('leads')
      .upsert(row, { onConflict: 'ghl_contact_id' })
      .select('id')
      .single();
    if (error || !inserted) return null;
    return inserted.id as string;
  } catch (e) {
    console.error('ensureLeadForEmail', email, e);
    return null;
  }
}

export async function enrichLeadFromGhl(contactId: string, leadId: string): Promise<void> {
  // Custom fields + tags
  try {
    const { contact } = await ghl.getContact(contactId);
    if (contact) {
      const patch: Record<string, unknown> = {};
      if (contact.customFields) {
        const cash = pickNumericCustomField(contact, CF_IDS.cash_collected);
        const tm = pickNumericCustomField(contact, CF_IDS.three_month_payment);
        const tcr = pickNumericCustomField(contact, CF_IDS.total_contract_revenue);
        const mrr = tm ?? tcr;
        if (cash !== null) patch.cash_collected = cash;
        if (mrr !== null) patch.contracted_mrr = mrr;
      }
      // Always refresh tags so intro/demo outcome classification stays accurate.
      if (Array.isArray(contact.tags)) patch.tags = contact.tags.length ? contact.tags : null;
      if (Object.keys(patch).length) {
        await supabaseAdmin().from('leads').update(patch).eq('id', leadId);
      }
    }
  } catch (e) {
    console.error('enrich custom fields', contactId, e);
  }

  // Opportunity (pipeline_stage + won)
  await upsertOpportunity(contactId, leadId);

  // Appointments (intro/demo + resolved closer names)
  try {
    const appts = await fetchAllAppointmentsForContact(contactId);
    if (appts.length) await upsertAppointmentsForLead(contactId, leadId, appts);
  } catch (e) {
    console.error('enrich appointments', contactId, e);
  }
}

/**
 * Enrich every lead with a GHL contact id. Returns per-field update counts.
 * Intended to be called hourly from cron.
 */
export async function enrichAllLeads(limitPerBatch = 500): Promise<{ touched: number; total: number }> {
  const supa = supabaseAdmin();
  const { data: rows } = await supa
    .from('leads')
    .select('id, ghl_contact_id')
    .not('ghl_contact_id', 'is', null)
    .limit(limitPerBatch);
  let touched = 0;
  for (const r of rows || []) {
    try {
      await enrichLeadFromGhl(r.ghl_contact_id as string, r.id as string);
      touched++;
      await ghl.sleep(80);
    } catch (e) {
      console.error('enrichAllLeads row', r.ghl_contact_id, e);
    }
  }
  return { touched, total: (rows || []).length };
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
      const uid = (intro as Record<string, unknown>).assignedUserId as string | undefined;
      if (uid) patch.intro_closer = (await resolveGhlUserName(uid)) || uid;
    }
    if (demo) {
      patch.demo_booked = true;
      patch.demo_created_date = (demo.dateAdded as string) || demo.startTime || null;
      patch.demo_booked_for_date = demo.startTime || null;
      patch.demo_show_status = demo.appointmentStatus || null;
      const uid = (demo as Record<string, unknown>).assignedUserId as string | undefined;
      if (uid) patch.demo_assigned_closer = (await resolveGhlUserName(uid)) || uid;
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

    // Resolve GHL assigned user IDs to display names (Closer field)
    try {
      await resolveAssignedUserNames();
    } catch (e) {
      console.error('resolveAssignedUserNames', e);
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
