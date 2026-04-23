'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Lead, WindsorRow, KPIStats } from '@/lib/types';
import { computeKpis } from '@/lib/kpis';
import { useAdsOnly } from '@/lib/ads-only-context';
import { matchesLeadFilter } from '@/lib/is-paid';
import { classifyFromTags } from '@/lib/tag-classify';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { KpiCard } from '@/components/kpi-card';
import { Filters, defaultFilters, type FilterState } from '@/components/filters';
import { LeadTable } from '@/components/lead-table';
import { formatCurrency, formatPercent } from '@/lib/utils';
import Link from 'next/link';
import { Table, List } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface OverviewData {
  leadsByDay: { date: string; count: number }[];
  cplTrend: { date: string; spend: number; leads: number; cpl: number }[];
  leadsBySource: { source: string; count: number }[];
  leadsByPlacement: { placement: string; count: number }[];
  bestCampaignsByCpl: { campaign: string; spend: number; leads: number; cpl: number }[];
  newestLeads: { id: string; lead_name: string | null; email: string | null; date_opted_in: string | null; pipeline_stage: string | null; campaign_name: string | null }[];
  upcomingCalls: { type: 'intro' | 'demo'; booked_for: string; lead_name: string | null; closer: string | null; lead_id: string }[];
  cashCollected: number;
  cashInvoiced: number;
}

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5' };

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

const DATE_RANGES = [
  { label: 'Last 7d', from: () => daysAgo(7), to: () => today() },
  { label: 'Last 30d', from: () => daysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => today() },
  { label: 'YTD', from: () => '2026-01-01', to: () => today() },
  { label: 'All', from: () => '2020-01-01', to: () => '2030-12-31' },
];

function dateRange(idx: number) {
  const r = DATE_RANGES[idx] || DATE_RANGES[3];
  return {
    from: new Date(r.from() + 'T00:00:00Z'),
    to: new Date(r.to() + 'T23:59:59Z'),
  };
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [spend, setSpend] = useState<WindsorRow[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [rangeIdx, setRangeIdx] = useState(2); // default MTD
  const [view, setView] = useState<'summary' | 'leads'>('leads');
  const [loaded, setLoaded] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const { mode } = useAdsOnly();

  useEffect(() => {
    let cancelled = false;
    const r = DATE_RANGES[rangeIdx] || DATE_RANGES[3];
    const fromDate = r.from();
    const toDate = r.to();
    (async () => {
      try {
        const [leadsRes, spendRes] = await Promise.all([
          fetch('/api/leads'),
          fetch('/api/spend'),
        ]);
        const leadsJson = await leadsRes.json();
        const spendJson = await spendRes.json();
        if (cancelled) return;
        setLeads((leadsJson?.leads || []) as Lead[]);
        setSpend((spendJson?.spend || []) as WindsorRow[]);
      } catch (e) {
        console.error('dashboard fetch', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    // Fetch overview data
    fetch(`/api/stats/overview?from=${fromDate}&to=${toDate}&mode=${mode}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setOverview(json); })
      .catch(console.error);

    // Realtime subscription
    let channel: ReturnType<ReturnType<typeof supabaseBrowser>['channel']> | null = null;
    try {
      const supa = supabaseBrowser();
      channel = supa.channel('leads-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, async () => {
          const res = await fetch('/api/leads');
          const json = await res.json();
          if (json?.leads?.length) setLeads(json.leads as Lead[]);
        })
        .subscribe();
    } catch {
      // no creds, skip realtime
    }
    return () => {
      cancelled = true;
      if (channel) {
        try { channel.unsubscribe(); } catch { /* ignore */ }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx, mode]);

  const range = useMemo(() => dateRange(rangeIdx), [rangeIdx]);

  const matchStatus = (val: string | null | undefined, pick: string) => {
    const v = (val || '').toLowerCase();
    if (pick === 'showed') return v.includes('show') && !v.includes('no');
    if (pick === 'noshow') return v.includes('no') && v.includes('show');
    if (pick === 'cancelled') return v.includes('cancel');
    if (pick === 'scheduled') return v === 'scheduled' || v === 'confirmed' || v === 'new';
    return v === pick.toLowerCase();
  };

  // Lead set used for KPI math — honours the mode + user's filters but NOT
  // the date window. Booking-date KPIs (intros/demos booked-in-window,
  // no-shows, cancelled, clients closed) must consider a lead whose demo
  // happens inside the window even if their opt-in was earlier.
  const kpiScoped = useMemo(() => {
    return leads.filter((l) => {
      if (!matchesLeadFilter(l, mode)) return false;
      if (filters.score && String(l.app_grading) !== filters.score) return false;
      if (filters.stage) {
        const stageName = (l as Lead & { stage_name?: string }).stage_name || '';
        if (stageName.toLowerCase() !== filters.stage.toLowerCase()) return false;
      }
      if (filters.introStatus && !matchStatus(l.intro_show_status, filters.introStatus)) return false;
      if (filters.demoStatus && !matchStatus(l.demo_show_status, filters.demoStatus)) return false;
      if (filters.closed === 'yes' && !l.client_closed) return false;
      if (filters.closed === 'no' && l.client_closed) return false;
      if (filters.closer) {
        const f = filters.closer.toLowerCase();
        const match =
          (l.assigned_user_name || '').toLowerCase() === f ||
          (l.demo_assigned_closer || '').toLowerCase() === f ||
          (l.intro_closer || '').toLowerCase() === f;
        if (!match) return false;
      }
      if (filters.campaign) {
        if ((l.campaign_name || '').toLowerCase() !== filters.campaign.toLowerCase()) return false;
      }
      return true;
    });
  }, [leads, filters, mode]);

  // `filtered` additionally applies the date window — used where the UI
  // wants a lead list scoped to "opted in during this period".
  const filtered = useMemo(() => {
    return kpiScoped.filter((l) => {
      if (!l.date_opted_in) return true;
      const t = new Date(l.date_opted_in).getTime();
      return t >= range.from.getTime() && t <= range.to.getTime();
    });
  }, [kpiScoped, range]);

  const kpis: KPIStats = useMemo(() => computeKpis(kpiScoped, spend, range), [kpiScoped, spend, range]);

  // Demo no-show / cancelled counts (drill-down KPI cards). Tag-based per
  // Anas: `demo-cancelled` beats `demo-no-show` beats `demo-showed`.
  // Uses kpiScoped so demos in window still count when opt-in was earlier.
  const demoNoShow = useMemo(() => kpiScoped.filter((l) => {
    if (!l.demo_booked_for_date) return false;
    const t = new Date(l.demo_booked_for_date).getTime();
    if (t < range.from.getTime() || t > range.to.getTime()) return false;
    const tagged = classifyFromTags(l.tags, 'demo');
    if (tagged) return tagged === 'noshow';
    const s = (l.demo_show_status || '').toLowerCase();
    return s.includes('no') && s.includes('show') && !s.includes('cancel');
  }).length, [kpiScoped, range]);
  const demoCancelled = useMemo(() => kpiScoped.filter((l) => {
    if (!l.demo_booked_for_date) return false;
    const t = new Date(l.demo_booked_for_date).getTime();
    if (t < range.from.getTime() || t > range.to.getTime()) return false;
    const tagged = classifyFromTags(l.tags, 'demo');
    if (tagged) return tagged === 'cancelled';
    return (l.demo_show_status || '').toLowerCase().includes('cancel');
  }).length, [kpiScoped, range]);

  const closers = useMemo(() => {
    const all = leads.flatMap((l) => [l.assigned_user_name, l.intro_closer, l.demo_assigned_closer]).filter(Boolean) as string[];
    return Array.from(new Set(all)).sort();
  }, [leads]);
  const campaigns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of leads) {
      if (!l.campaign_name) continue;
      const key = l.campaign_name.toLowerCase();
      if (!seen.has(key)) seen.set(key, l.campaign_name);
    }
    return Array.from(seen.values()).sort();
  }, [leads]);
  const stages = useMemo(() => {
    const all = leads.map((l) => (l as Lead & { stage_name?: string }).stage_name).filter(Boolean) as string[];
    return Array.from(new Set(all)).sort();
  }, [leads]);

  if (!loaded) return <div className="text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Filters value={filters} onChange={setFilters} rangeIdx={rangeIdx} onRangeChange={setRangeIdx} closers={closers} campaigns={campaigns} stages={stages} />

      {/* Hyros-parity row — ordered to match how Hyros displays for quick cross-check */}
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Hyros cross-check</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="CPL" value={formatCurrency(kpis.cpl)} />
          <KpiCard label="Intros" value={kpis.introsCreated} />
          <KpiCard label="Cost / Intro" value={formatCurrency(kpis.costPerIntro)} />
          <KpiCard label="Lead → Intro %" value={formatPercent(kpis.leadToIntroPct)} />
          <KpiCard label="Demos" value={kpis.demosCreated} />
          <KpiCard label="Cost / Demo" value={formatCurrency(kpis.costPerDemo)} />
          <KpiCard label="Cost / Shown Intro" value={formatCurrency(kpis.costPerShownIntro)} />
          <KpiCard label="Cost / Shown Demo" value={formatCurrency(kpis.costPerShownDemo)} />
          <KpiCard label="Intro → Demo %" value={formatPercent(kpis.introToDemoPct)} />
        </div>
      </div>

      {/* Row 1: Spend / Leads / CPL / Score mix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Spend" value={formatCurrency(kpis.totalSpend)} />
        <KpiCard label="Leads" value={kpis.totalLeads} />
        <KpiCard label="Cost / Lead" value={formatCurrency(kpis.cpl)} />
        <KpiCard label="Cost / Qualified Lead" value={formatCurrency(kpis.costPerQualifiedLead)} />
      </div>

      {/* Row 2: Intros */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Intros Created" value={kpis.introsCreated} />
        <KpiCard label="Intros Booked (Month)" value={kpis.introsBookedForMonth} />
        <KpiCard label="Cost / Intro" value={formatCurrency(kpis.costPerIntro)} />
        <KpiCard label="Lead → Intro %" value={formatPercent(kpis.leadToIntroPct)} />
        <KpiCard label="Cost / Shown Intro" value={formatCurrency(kpis.costPerShownIntro)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Intros Showed" value={kpis.introsShowed} accent="positive" />
        <Link href="/dashboard/appointments?type=intro&status=noshow" className="contents">
          <div className="cursor-pointer hover:opacity-90"><KpiCard label="Intro No-Show →" value={kpis.introNoShow} accent="negative" /></div>
        </Link>
        <Link href="/dashboard/appointments?type=intro&status=cancelled" className="contents">
          <div className="cursor-pointer hover:opacity-90"><KpiCard label="Intro Cancelled →" value={kpis.introCancelled} accent="negative" /></div>
        </Link>
        <KpiCard label="DQ Rate" value={formatPercent(kpis.dqRate)} accent="negative" />
        <KpiCard label="Intro Show Rate" value={formatPercent(kpis.introShowRate)} accent="positive" />
      </div>

      {/* Row 3: Demos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Demos Created" value={kpis.demosCreated} />
        <KpiCard label="Demos Booked (Month)" value={kpis.demosBookedForMonth} />
        <KpiCard label="Cost / Demo" value={formatCurrency(kpis.costPerDemo)} />
        <KpiCard label="Intro → Demo %" value={formatPercent(kpis.introToDemoPct)} />
        <KpiCard label="Demos Showed" value={kpis.demosShowed} accent="positive" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Demo Show Rate" value={formatPercent(kpis.demoShowRate)} accent="positive" />
        <KpiCard label="Cost / Shown Demo" value={formatCurrency(kpis.costPerShownDemo)} />
        <KpiCard label="Clients Closed" value={kpis.clientsClosed} accent="positive" />
        <KpiCard label="Close Rate" value={formatPercent(kpis.closeRate)} accent="positive" />
        <KpiCard label="CPA" value={formatCurrency(kpis.cpa)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link href="/dashboard/appointments?type=demo&status=noshow" className="contents">
          <div className="cursor-pointer hover:opacity-90"><KpiCard label="Demo No-Show →" value={demoNoShow} accent="negative" /></div>
        </Link>
        <Link href="/dashboard/appointments?type=demo&status=cancelled" className="contents">
          <div className="cursor-pointer hover:opacity-90"><KpiCard label="Demo Cancelled →" value={demoCancelled} accent="negative" /></div>
        </Link>
        <KpiCard label="Demos Showed" value={kpis.demosShowed} accent="positive" />
      </div>

      {/* Row 4: Revenue */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Cash Collected" value={formatCurrency(kpis.cashCollected)} accent="positive" />
        <KpiCard label="New MRR" value={formatCurrency(kpis.newMrr)} accent="positive" />
        <KpiCard label="Avg Cash / Close" value={formatCurrency(kpis.avgCashPerClose)} />
        <KpiCard label="ROAS Cash" value={`${kpis.roasCash.toFixed(2)}x`} accent={kpis.roasCash >= 1 ? 'positive' : 'negative'} />
        <KpiCard label="ROAS LTV" value={`${kpis.roasLtv.toFixed(2)}x`} accent={kpis.roasLtv >= 1 ? 'positive' : 'negative'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Trash Leads" value={kpis.trashLeads} accent="negative" />
        <KpiCard label="Setter-Booked Intros" value={kpis.setterBookedIntros} />
        <KpiCard label="Instant-Convert Intros" value={kpis.instantConvertIntros} />
        <KpiCard label="Setter Conversion Rate" value={formatPercent(kpis.setterConversionRate)} />
      </div>

      {/* Charts + Tables row */}
      {overview && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Lead Generation chart */}
            <div className="card p-4">
              <div className="text-sm font-medium text-zinc-100 mb-3">Lead Generation</div>
              {overview.leadsByDay.length === 0 ? (
                <div className="text-zinc-500 text-sm">No data for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={overview.leadsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="count" name="Leads" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* CPL Trend chart */}
            <div className="card p-4">
              <div className="text-sm font-medium text-zinc-100 mb-3">CPL Trend</div>
              {overview.cplTrend.length === 0 ? (
                <div className="text-zinc-500 text-sm">No data for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={overview.cplTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, 'CPL']} />
                    <Line dataKey="cpl" name="CPL" stroke="#38bdf8" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bottom 4-column tables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Leads by Source */}
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">By Source</div>
              <div className="space-y-2">
                {overview.leadsBySource.slice(0, 8).map((s) => (
                  <div key={s.source} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400 truncate">{s.source}</span>
                    <span className="text-xs font-medium text-zinc-100 shrink-0">{s.count}</span>
                  </div>
                ))}
                {overview.leadsBySource.length === 0 && <div className="text-xs text-zinc-500">No data</div>}
              </div>
            </div>

            {/* Leads by Placement */}
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">By Placement</div>
              <div className="space-y-2">
                {overview.leadsByPlacement.slice(0, 8).map((p) => (
                  <div key={p.placement} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400 truncate">{p.placement}</span>
                    <span className="text-xs font-medium text-zinc-100 shrink-0">{p.count}</span>
                  </div>
                ))}
                {overview.leadsByPlacement.length === 0 && <div className="text-xs text-zinc-500">No data</div>}
              </div>
            </div>

            {/* Best Campaigns by CPL */}
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Best CPL</div>
              <div className="space-y-2">
                {overview.bestCampaignsByCpl.slice(0, 8).map((c) => (
                  <div key={c.campaign} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400 truncate">{c.campaign}</span>
                    <span className="text-xs font-medium text-emerald-400 shrink-0">{formatCurrency(c.cpl)}</span>
                  </div>
                ))}
                {overview.bestCampaignsByCpl.length === 0 && <div className="text-xs text-zinc-500">No data</div>}
              </div>
            </div>

            {/* Newest Leads */}
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Newest Leads</div>
              <div className="space-y-2">
                {overview.newestLeads.map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-300 truncate">{l.lead_name || '—'}</div>
                      <div className="text-xs text-zinc-500 truncate">{l.pipeline_stage || '—'}</div>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {l.date_opted_in ? new Date(l.date_opted_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  </div>
                ))}
                {overview.newestLeads.length === 0 && <div className="text-xs text-zinc-500">No data</div>}
              </div>
            </div>
          </div>

          {/* Upcoming Calls + Cash row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Upcoming Calls */}
            <div className="card p-4 lg:col-span-2">
              <div className="text-sm font-medium text-zinc-100 mb-3">Upcoming Calls (14 days)</div>
              {overview.upcomingCalls.length === 0 ? (
                <div className="text-zinc-500 text-sm">No upcoming calls.</div>
              ) : (
                <div className="space-y-2">
                  {overview.upcomingCalls.map((call, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${call.type === 'intro' ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {call.type}
                      </span>
                      <span className="text-sm text-zinc-200 truncate flex-1">{call.lead_name || '—'}</span>
                      <span className="text-xs text-zinc-500 shrink-0">{call.closer || '—'}</span>
                      <span className="text-xs text-zinc-600 shrink-0">
                        {new Date(call.booked_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cash section */}
            <div className="card p-4 space-y-4">
              <div className="text-sm font-medium text-zinc-100">Cash Overview</div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Collected</div>
                <div className="text-2xl font-semibold text-emerald-400">{formatCurrency(overview.cashCollected)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Contracted MRR</div>
                <div className="text-2xl font-semibold text-zinc-100">{formatCurrency(overview.cashInvoiced)}</div>
              </div>
              {overview.cashInvoiced > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Collection Rate</div>
                  <div className="text-lg font-semibold text-sky-400">
                    {formatPercent((overview.cashCollected / overview.cashInvoiced) * 100)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('summary')} className={`btn flex items-center gap-1.5 ${view === 'summary' ? 'bg-zinc-800' : ''}`}>
          <Table className="w-4 h-4" />Monthly Summary
        </button>
        <button onClick={() => setView('leads')} className={`btn flex items-center gap-1.5 ${view === 'leads' ? 'bg-zinc-800' : ''}`}>
          <List className="w-4 h-4" />Individual Leads
        </button>
        <div className="ml-auto text-xs text-zinc-500">{filtered.length} leads</div>
      </div>

      {view === 'leads' ? <LeadTable leads={filtered} /> : <MonthlyTable leads={leads} spend={spend} />}
    </div>
  );
}

function MonthlyTable({ leads, spend }: { leads: Lead[]; spend: WindsorRow[] }) {
  const rows = Array.from({ length: 12 }, (_, m) => {
    const r = { from: new Date(Date.UTC(2026, m, 1)), to: new Date(Date.UTC(2026, m + 1, 0, 23, 59, 59)) };
    const k = computeKpis(leads, spend, r);
    return { month: new Date(2026, m, 1).toLocaleString('en', { month: 'short' }), k };
  });

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 border-b border-zinc-800">
          <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-3 py-2">Month</th>
            <th className="px-3 py-2">Spend</th>
            <th className="px-3 py-2">Leads</th>
            <th className="px-3 py-2">CPL</th>
            <th className="px-3 py-2">Intros</th>
            <th className="px-3 py-2">Demos</th>
            <th className="px-3 py-2">Closed</th>
            <th className="px-3 py-2">Cash</th>
            <th className="px-3 py-2">MRR</th>
            <th className="px-3 py-2">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b border-zinc-800/50">
              <td className="px-3 py-2 font-medium">{r.month}</td>
              <td className="px-3 py-2">{formatCurrency(r.k.totalSpend)}</td>
              <td className="px-3 py-2">{r.k.totalLeads}</td>
              <td className="px-3 py-2">{formatCurrency(r.k.cpl)}</td>
              <td className="px-3 py-2">{r.k.introsCreated}</td>
              <td className="px-3 py-2">{r.k.demosCreated}</td>
              <td className="px-3 py-2">{r.k.clientsClosed}</td>
              <td className="px-3 py-2">{formatCurrency(r.k.cashCollected)}</td>
              <td className="px-3 py-2">{formatCurrency(r.k.newMrr)}</td>
              <td className="px-3 py-2">{r.k.roasCash.toFixed(2)}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
