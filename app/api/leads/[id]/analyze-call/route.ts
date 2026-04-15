import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeCallTranscript, ANALYSIS_MODEL } from '@/lib/analyze-call';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = supabaseAdmin();
  const { data: pending } = await supa
    .from('call_analyses')
    .select('*')
    .eq('lead_id', id)
    .is('analyzed_at', null)
    .not('raw_transcript', 'is', null);

  if (!pending?.length) return NextResponse.json({ ok: true, count: 0, message: 'No pending calls.' });

  let count = 0;
  const errors: string[] = [];
  for (const row of pending) {
    try {
      const r = await analyzeCallTranscript(row.raw_transcript as string, row.call_type);
      await supa
        .from('call_analyses')
        .update({
          ai_summary: r.summary,
          ai_lead_insights: r.lead_insights,
          ai_call_quality_score: r.call_quality_score,
          ai_closer_performance: r.closer_performance,
          ai_next_steps: r.next_steps,
          ai_red_flags: r.red_flags,
          ai_buying_signals: r.buying_signals,
          analyzed_at: new Date().toISOString(),
          analysis_model: ANALYSIS_MODEL,
        })
        .eq('id', row.id);

      // Also write the inferred outcome back onto the lead so the pipeline
      // table reflects AI judgment.
      if (r.outcome) {
        const patch: Record<string, unknown> = {};
        if (row.call_type === 'intro') patch.intro_call_outcome = r.outcome;
        else if (row.call_type === 'demo') patch.demo_call_outcome = r.outcome;
        if (Object.keys(patch).length) {
          await supa.from('leads').update(patch).eq('id', id);
        }
      }

      count++;
    } catch (e) {
      errors.push(String(e).slice(0, 120));
    }
  }
  return NextResponse.json({ ok: true, count, errors });
}
