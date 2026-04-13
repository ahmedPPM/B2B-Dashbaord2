import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateLeadScore } from '@/lib/scoring';
import type { GHLContact } from '@/lib/ghl';

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return true; // allow in dev
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-ghl-signature') || req.headers.get('x-webhook-signature');
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  // Fire and forget (respond 200 fast)
  handleEvent(payload).catch((e) => console.error('ghl webhook', e));
  return NextResponse.json({ ok: true });
}

async function handleEvent(payload: Record<string, unknown>) {
  const type = (payload.type || payload.event) as string | undefined;
  const supa = supabaseAdmin();

  if (type === 'ContactCreate' || type === 'ContactUpdate') {
    const contact = (payload.contact || payload) as GHLContact;
    if (!contact?.id) return;
    const score = calculateLeadScore(contact);
    const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;
    await supa.from('leads').upsert(
      {
        ghl_contact_id: contact.id,
        lead_name: name,
        email: contact.email || null,
        phone: contact.phone || null,
        app_grading: score,
        date_opted_in: contact.dateAdded || null,
        lead_tag: contact.tags?.[0] || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ghl_contact_id' }
    );
    return;
  }

  if (type === 'OpportunityStageChanged') {
    const p = payload as { contactId?: string; fromStageId?: string; toStageId?: string };
    if (!p.contactId) return;
    const { data: lead } = await supa.from('leads').select('id').eq('ghl_contact_id', p.contactId).maybeSingle();
    if (!lead) return;
    await supa.from('pipeline_events').insert({
      lead_id: lead.id,
      ghl_contact_id: p.contactId,
      from_stage: p.fromStageId || null,
      to_stage: p.toStageId || null,
      source: 'webhook',
    });
    await supa.from('leads').update({ pipeline_stage: p.toStageId || null }).eq('id', lead.id);
    return;
  }

  if (type === 'AppointmentCreate') {
    const p = payload as { contactId?: string; startTime?: string; title?: string; status?: string };
    if (!p.contactId) return;
    const { data: lead } = await supa.from('leads').select('id').eq('ghl_contact_id', p.contactId).maybeSingle();
    if (!lead) return;
    const isDemo = /demo/i.test(p.title || '');
    const patch = isDemo
      ? { demo_booked: true, demo_booked_for_date: p.startTime || null, demo_created_date: new Date().toISOString(), demo_show_status: p.status || null }
      : { intro_booked: true, intro_booked_for_date: p.startTime || null, intro_created_date: new Date().toISOString(), intro_show_status: p.status || null };
    await supa.from('leads').update(patch).eq('id', lead.id);
    return;
  }

  if (type === 'NoteCreate') {
    const p = payload as { contactId?: string; body?: string; callId?: string };
    if (!p.contactId) return;
    if (!/call summary|transcript/i.test(p.body || '')) return;
    const { data: lead } = await supa.from('leads').select('id').eq('ghl_contact_id', p.contactId).maybeSingle();
    if (!lead) return;
    await supa.from('call_analyses').insert({
      lead_id: lead.id,
      ghl_contact_id: p.contactId,
      ghl_call_id: p.callId || `note-${Date.now()}`,
      call_type: 'other',
      call_date: new Date().toISOString(),
      raw_transcript: p.body || null,
    });
  }
}
