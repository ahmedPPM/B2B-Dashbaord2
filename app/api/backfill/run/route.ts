import { NextResponse } from 'next/server';
import { runBackfill } from '@/lib/backfill';

export async function POST() {
  try {
    const result = await runBackfill();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
