import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeCallTranscript, ANALYSIS_MODEL } from '@/lib/analyze-call';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const manual = url.searchParams.get('manual') === '1';
  const auth = req.headers.get('authorization');
  if (!manual && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const { data: pending } = await supa
    .from('call_analyses')
    .select('*')
    .is('analyzed_at', null)
    .not('raw_transcript', 'is', null)
    .limit(20);

  if (!pending?.length) return NextResponse.json({ ok: true, analyzed: 0 });

  let analyzed = 0;
  const errors: string[] = [];

  for (const row of pending) {
    try {
      const result = await analyzeCallTranscript(row.raw_transcript as string, row.call_type);
      await supa
        .from('call_analyses')
        .update({
          ai_summary: result.summary,
          ai_lead_insights: result.lead_insights,
          ai_call_quality_score: result.call_quality_score,
          ai_closer_performance: result.closer_performance,
          ai_next_steps: result.next_steps,
          ai_red_flags: result.red_flags,
          ai_buying_signals: result.buying_signals,
          analyzed_at: new Date().toISOString(),
          analysis_model: ANALYSIS_MODEL,
        })
        .eq('id', row.id);
      analyzed++;
    } catch (e) {
      errors.push(`${row.id}: ${String(e).slice(0, 120)}`);
    }
  }

  return NextResponse.json({ ok: true, analyzed, errors });
}
