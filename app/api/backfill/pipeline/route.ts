import { NextResponse } from 'next/server';
import { backfillPipelineStages } from '@/lib/pipelines';

export async function POST() {
  try {
    const updated = await backfillPipelineStages();
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
