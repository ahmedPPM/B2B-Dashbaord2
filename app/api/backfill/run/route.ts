import { NextResponse } from 'next/server';
import { runBackfill } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await runBackfill();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
