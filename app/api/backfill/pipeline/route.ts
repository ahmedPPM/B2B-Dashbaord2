import { NextResponse } from 'next/server';
import { backfillPipelineStages } from '@/lib/pipelines';
import { requireCron } from '@/lib/api-auth';

export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const updated = await backfillPipelineStages();
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
