import type { Lead, WindsorRow, KPIStats } from './types';
import { classifyFromTags } from './tag-classify';

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

  // Outcome classification is tag-driven (per Anas): cancelled > noshow >
  // showed, decided by GHL tags like `demo-cancelled`, `intro-no-show`,
  // `demo-showed`. Falls back to the legacy status string when a lead
  // hasn't been tag-backfilled yet (backward compatible during rollout).
  const outcomeOf = (l: Lead, kind: 'intro' | 'demo'): 'cancelled' | 'noshow' | 'showed' | null => {
    const tagged = classifyFromTags(l.tags, kind);
    if (tagged) return tagged;
    const s = ((kind === 'intro' ? l.intro_show_status : l.demo_show_status) || '').toLowerCase();
    if (s.includes('cancel')) return 'cancelled';
    if (s.includes('no') && s.includes('show')) return 'noshow';
    if (s) return 'showed';
    return null;
  };
  // Show-rate policy: default = SHOWED unless explicitly marked no-show
  // OR cancelled. Eraldi only marks failures, not successes.
  const isShownDefault = (l: Lead, kind: 'intro' | 'demo') => {
    const o = outcomeOf(l, kind);
    return o !== 'noshow' && o !== 'cancelled';
  };

  // Intros
  const introsCreated = periodLeads.filter((l) => l.intro_created_date).length;
  const introsBookedForMonth = leads.filter((l) =>
    inRange(l.intro_booked_for_date, range)
  ).length;
  const introsShowed = leads.filter(
    (l) => inRange(l.intro_booked_for_date, range) && isShownDefault(l, 'intro')
  ).length;
  const introNoShow = leads.filter(
    (l) => inRange(l.intro_booked_for_date, range) && outcomeOf(l, 'intro') === 'noshow'
  ).length;
  const introCancelled = leads.filter(
    (l) => inRange(l.intro_booked_for_date, range) && outcomeOf(l, 'intro') === 'cancelled'
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
    (l) => inRange(l.demo_booked_for_date, range) && isShownDefault(l, 'demo')
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
