import { NextResponse } from 'next/server';
import { reclassifyCallTypesForLeads } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

export async function POST(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await reclassifyCallTypesForLeads();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
