import { NextResponse } from 'next/server';
import { enrichAllLeads } from '@/lib/backfill';
import { requireCron } from '@/lib/api-auth';

// Long-running sweep: for every lead with a ghl_contact_id, re-fetch
// contact custom fields + opportunities + appointments and update the
// dashboard row. Meant to be called by the Railway hourly cron runner.
export const maxDuration = 300; // 5 minutes

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await enrichAllLeads();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
