import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveStage } from '@/lib/pipelines';
import { logActivity } from '@/lib/activity';

const EDITABLE_FIELDS = new Set([
  'lead_name',
  'email',
  'phone',
  'pipeline_stage',
  'cash_collected',
  'contracted_mrr',
  'client_closed',
  'lead_source',
  'why_didnt_close',
  'app_grading',
  'assigned_user_name',
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = supabaseAdmin();
  const { data: lead, error } = await supa.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  const { data: calls } = await supa.from('call_analyses').select('*').eq('lead_id', id).order('call_date', { ascending: false });
  let stage: { stageName: string; pipelineName: string; position: number } | null = null;
  try {
    stage = await resolveStage(lead.pipeline_stage);
  } catch (e) {
    console.error('resolveStage', e);
  }
  return NextResponse.json({
    ok: true,
    lead: { ...lead, stage_name: stage?.stageName, pipeline_name: stage?.pipelineName },
    calls: calls || [],
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { actor?: string; patch?: Record<string, unknown> };
  const patch = body.patch || {};
  const actor = body.actor || null;

  const safePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (EDITABLE_FIELDS.has(k)) safePatch[k] = v;
  }
  if (Object.keys(safePatch).length === 0) {
    return NextResponse.json({ ok: false, error: 'no editable fields in patch' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const { data: before } = await supa.from('leads').select('*').eq('id', id).maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  // If client_closed is flipping true, stamp client_closed_date.
  const beforeClosed = (before as Record<string, unknown>).client_closed as boolean | null;
  if (safePatch.client_closed === true && !beforeClosed) {
    (safePatch as Record<string, unknown>).client_closed_date = new Date().toISOString();
  }
  if (safePatch.client_closed === false) {
    (safePatch as Record<string, unknown>).client_closed_date = null;
  }

  const { data: after, error } = await supa
    .from('leads')
    .update({ ...safePatch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  for (const k of Object.keys(safePatch)) {
    beforeDiff[k] = (before as Record<string, unknown>)[k] ?? null;
    afterDiff[k] = (after as Record<string, unknown> | null)?.[k] ?? null;
  }
  await logActivity({ leadId: id, action: 'edit', actor, before: beforeDiff, after: afterDiff });

  return NextResponse.json({ ok: true, lead: after });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const actor = url.searchParams.get('actor');
  const restore = url.searchParams.get('restore') === 'true';

  const supa = supabaseAdmin();
  const { data: before } = await supa.from('leads').select('*').eq('id', id).maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  const deletedAt = restore ? null : new Date().toISOString();
  const { error } = await supa.from('leads').update({ deleted_at: deletedAt }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await logActivity({
    leadId: id,
    action: restore ? 'restore' : 'delete',
    actor,
    before: restore ? { deleted_at: before.deleted_at } : before,
    after: restore ? { deleted_at: null } : { deleted_at: deletedAt },
  });

  return NextResponse.json({ ok: true, restored: restore });
}
