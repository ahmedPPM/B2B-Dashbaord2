import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveStage } from '@/lib/pipelines';

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
  return NextResponse.json({ ok: true, lead: { ...lead, stage_name: stage?.stageName, pipeline_name: stage?.pipelineName }, calls: calls || [] });
}
