import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get('from') || `${new Date().getFullYear()}-01-01`;
  const toStr = url.searchParams.get('to') || `${new Date().getFullYear()}-12-31`;

  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from('leads')
    .select('id, intro_closer, demo_assigned_closer, assigned_user_name, intro_booked_for_date, demo_booked_for_date, intro_show_status, demo_show_status, client_closed, client_closed_date, date_opted_in, cash_collected')
    .is('deleted_at', null)
    .limit(5000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const leads = data || [];

  // Collect all unique closer names
  const closerSet = new Set<string>();
  for (const l of leads) {
    if (l.intro_closer) closerSet.add(l.intro_closer);
    if (l.demo_assigned_closer) closerSet.add(l.demo_assigned_closer);
    if (l.assigned_user_name) closerSet.add(l.assigned_user_name);
  }

  const inRange = (d: string | null | undefined) => {
    if (!d) return false;
    const day = d.slice(0, 10);
    return day >= fromStr && day <= toStr;
  };

  const isShowed = (status: string | null | undefined) => {
    const s = (status || '').toLowerCase();
    // showed = has 'show' but not ('no show' or 'cancel')
    const isNoShow = s.includes('no') && s.includes('show');
    const isCancelled = s.includes('cancel');
    const hasShow = s.includes('show');
    return hasShow && !isNoShow && !isCancelled;
  };

  const closers = Array.from(closerSet).map((name) => {
    const introLeads = leads.filter(
      (l) => l.intro_closer === name && inRange(l.intro_booked_for_date)
    );
    const demoLeads = leads.filter(
      (l) => l.demo_assigned_closer === name && inRange(l.demo_booked_for_date)
    );

    const intros = introLeads.length;
    const demos = demoLeads.length;
    const introsShowed = introLeads.filter((l) => isShowed(l.intro_show_status)).length;
    const demosShowed = demoLeads.filter((l) => isShowed(l.demo_show_status)).length;

    const closedLeads = leads.filter((l) => {
      if (l.demo_assigned_closer !== name) return false;
      if (!l.client_closed) return false;
      const d = l.client_closed_date || l.date_opted_in;
      return inRange(d);
    });
    const closed = closedLeads.length;

    const cashCollected = leads
      .filter((l) => l.demo_assigned_closer === name)
      .reduce((sum, l) => sum + (Number(l.cash_collected) || 0), 0);

    const introShowRate = intros > 0 ? (introsShowed / intros) * 100 : 0;
    const demoShowRate = demos > 0 ? (demosShowed / demos) * 100 : 0;
    const closeRate = demosShowed > 0 ? (closed / demosShowed) * 100 : 0;

    return {
      name,
      intros,
      demos,
      introsShowed,
      demosShowed,
      introShowRate,
      demoShowRate,
      closed,
      closeRate,
      cashCollected,
    };
  });

  // Filter out closers with < 2 total activity and sort by cashCollected
  const filtered = closers
    .filter((c) => c.intros + c.demos >= 2)
    .sort((a, b) => b.cashCollected - a.cashCollected);

  return NextResponse.json({ ok: true, closers: filtered, range: { from: fromStr, to: toStr } });
}
