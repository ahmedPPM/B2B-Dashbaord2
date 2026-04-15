import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeCallTranscript, ANALYSIS_MODEL } from '@/lib/analyze-call';

// POST /api/leads/[id]/fathom-call
// Body: { url?: string; transcript?: string; analyze?: boolean }
// Creates or updates a call_analyses row sourced from Fathom.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { url?: string; transcript?: string; analyze?: boolean };
  const url = body.url?.trim() || null;
  const transcript = body.transcript?.trim() || null;
  if (!url && !transcript) {
    return NextResponse.json({ ok: false, error: 'Provide Fathom URL or transcript' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const { data: lead } = await supa.from('leads').select('id, ghl_contact_id').eq('id', id).maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 });

  const ghlCallId = `fathom-${id}`;

  // Upsert by ghl_call_id (one Fathom demo per lead)
  const { data: existing } = await supa
    .from('call_analyses')
    .select('*')
    .eq('ghl_call_id', ghlCallId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    lead_id: id,
    ghl_contact_id: lead.ghl_contact_id,
    ghl_call_id: ghlCallId,
    call_type: 'demo',
    call_date: existing?.call_date || new Date().toISOString(),
  };
  if (url !== null) patch.call_recording_url = url;
  if (transcript !== null) {
    patch.raw_transcript = transcript;
    // Re-analyze on transcript change
    if (existing && existing.raw_transcript !== transcript) patch.analyzed_at = null;
  }

  let row;
  if (existing) {
    const { data, error } = await supa.from('call_analyses').update(patch).eq('id', existing.id).select('*').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    row = data;
  } else {
    const { data, error } = await supa.from('call_analyses').insert(patch).select('*').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    row = data;
  }

  // Optionally run analysis inline
  if (body.analyze !== false && row?.raw_transcript && !row?.analyzed_at) {
    try {
      const r = await analyzeCallTranscript(row.raw_transcript as string, 'demo');
      await supa.from('call_analyses').update({
        ai_summary: r.summary,
        ai_lead_insights: r.lead_insights,
        ai_call_quality_score: r.call_quality_score,
        ai_closer_performance: r.closer_performance,
        ai_next_steps: r.next_steps,
        ai_red_flags: r.red_flags,
        ai_buying_signals: r.buying_signals,
        analyzed_at: new Date().toISOString(),
        analysis_model: ANALYSIS_MODEL,
      }).eq('id', row.id);
      if (r.outcome) {
        await supa.from('leads').update({ demo_call_outcome: r.outcome }).eq('id', id);
      }
      const { data: refreshed } = await supa.from('call_analyses').select('*').eq('id', row.id).maybeSingle();
      row = refreshed;
    } catch (e) {
      console.error('fathom analyze failed', e);
    }
  }

  return NextResponse.json({ ok: true, call: row });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = supabaseAdmin();
  const { data } = await supa
    .from('call_analyses')
    .select('*')
    .eq('ghl_call_id', `fathom-${id}`)
    .maybeSingle();
  return NextResponse.json({ ok: true, call: data || null });
}
