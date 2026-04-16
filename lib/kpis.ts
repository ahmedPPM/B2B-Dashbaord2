import type { Lead, WindsorRow, KPIStats } from './types';

export interface DateRange {
  from: Date;
  to: Date;
}

function inRange(date: string | null, r: DateRange): boolean {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return (n / d) * 100;
}

function div(n: number, d: number): number {
  if (!d) return 0;
  return n / d;
}

export function computeKpis(
  leads: Lead[],
  spend: WindsorRow[],
  range: DateRange
): KPIStats {
  const LTV = parseFloat(process.env.LTV_VALUE || '9187') || 9187;

  const totalSpend = spend
    .filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= range.from.getTime() && t <= range.to.getTime();
    })
    .reduce((a, b) => a + (b.spend || 0), 0);

  // Leads opted in during the period
  const periodLeads = leads.filter((l) => inRange(l.date_opted_in, range));
  const totalLeads = periodLeads.length;

  // Status helpers — case-insensitive & pattern-based so mixed GHL values
  // (Scheduled / confirmed / Showed / showed / noshow / Cancelled) behave
  // consistently. Show-rate policy (per Anas): default = SHOWED unless
  // explicitly marked no-show OR cancelled. This matches the team process
  // where Eraldi marks only failures, not successes.
  const isNoShow = (s: string | null | undefined) => {
    const v = (s || '').toLowerCase();
    return v.includes('no') && v.includes('show');
  };
  const isCancelled = (s: string | null | undefined) => {
    const v = (s || '').toLowerCase();
    return v.includes('cancel');
  };
  const isShownDefault = (s: string | null | undefined) => {
    // anything that isn't explicitly no-show/cancelled → counts as shown
    return !isNoShow(s) && !isCancelled(s);
  };

  // Intros
  const introsCreated = periodLeads.filter((l) => l.intro_created_date).length;
  const introsBookedForMonth = leads.filter((l) =>
    inRange(l.intro_booked_for_date, range)
  ).length;
  const introsShowed = leads.filter(
    (l) =>
      inRange(l.intro_booked_for_date, range) &&
      isShownDefault(l.intro_show_status)
  ).length;
  const introNoShow = leads.filter(
    (l) => inRange(l.intro_booked_for_date, range) && isNoShow(l.intro_show_status)
  ).length;
  const introCancelled = leads.filter(
    (l) => inRange(l.intro_booked_for_date, range) && isCancelled(l.intro_show_status)
  ).length;

  const trashLeads = periodLeads.filter((l) => l.app_grading === 1).length;
  const qualifiedLeads = totalLeads - trashLeads;
  const dqRate = pct(trashLeads, totalLeads);

  // Demos
  const demosCreated = periodLeads.filter((l) => l.demo_created_date).length;
  const demosBookedForMonth = leads.filter((l) =>
    inRange(l.demo_booked_for_date, range)
  ).length;
  const demosShowed = leads.filter(
    (l) =>
      inRange(l.demo_booked_for_date, range) &&
      isShownDefault(l.demo_show_status)
  ).length;

  // Closes
  const closedInPeriod = leads.filter(
    (l) => l.client_closed && inRange(l.demo_booked_for_date, range)
  );
  const clientsClosed = closedInPeriod.length;
  const cashCollected = closedInPeriod.reduce((a, b) => a + (b.cash_collected || 0), 0);
  const newMrr = closedInPeriod.reduce((a, b) => a + (b.contracted_mrr || 0), 0);

  // Setter vs instant
  const setterBookedIntros = leads.filter(
    (l) =>
      inRange(l.intro_booked_for_date, range) &&
      l.intro_closer &&
      l.intro_closer !== 'instant'
  ).length;
  const instantConvertIntros = leads.filter(
    (l) =>
      inRange(l.intro_booked_for_date, range) &&
      (l.intro_closer === 'instant' || l.dials_per_lead === 0)
  ).length;

  return {
    totalSpend,
    totalLeads,
    cpl: div(totalSpend, totalLeads),
    introsCreated,
    introsBookedForMonth,
    costPerIntro: div(totalSpend, introsCreated),
    leadToIntroPct: pct(introsCreated, totalLeads),
    introsShowed,
    introNoShow,
    introCancelled,
    dqRate,
    introShowRate: pct(introsShowed, introsBookedForMonth),
    costPerShownIntro: div(totalSpend, introsShowed),
    demosCreated,
    demosBookedForMonth,
    costPerDemo: div(totalSpend, demosCreated),
    introToDemoPct: pct(demosCreated, introsCreated),
    demosShowed,
    demoShowRate: pct(demosShowed, demosBookedForMonth),
    costPerShownDemo: div(totalSpend, demosShowed),
    clientsClosed,
    closeRate: pct(clientsClosed, demosShowed),
    cpa: div(totalSpend, clientsClosed),
    cashCollected,
    newMrr,
    avgCashPerClose: div(cashCollected, clientsClosed),
    roasCash: div(cashCollected, totalSpend),
    roasLtv: div(clientsClosed * LTV, totalSpend),
    trashLeads,
    costPerQualifiedLead: div(totalSpend, qualifiedLeads),
    setterBookedIntros,
    instantConvertIntros,
    setterConversionRate: pct(setterBookedIntros, setterBookedIntros + instantConvertIntros),
  };
}
