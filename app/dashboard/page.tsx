'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Lead, WindsorRow, KPIStats } from '@/lib/types';
import { generateMockLeads, generateMockSpend } from '@/lib/mock-data';
import { computeKpis } from '@/lib/kpis';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { KpiCard } from '@/components/kpi-card';
import { Filters, defaultFilters, type FilterState } from '@/components/filters';
import { LeadTable } from '@/components/lead-table';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Table, List } from 'lucide-react';

const MONTH_INDEX: Record<string, number> = {
  'Jan 2026':0,'Feb 2026':1,'Mar 2026':2,'Apr 2026':3,'May 2026':4,'Jun 2026':5,
  'Jul 2026':6,'Aug 2026':7,'Sep 2026':8,'Oct 2026':9,'Nov 2026':10,'Dec 2026':11,
};

function monthRange(label: string) {
  if (label === 'All 2026') {
    return { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31, 23, 59, 59)) };
  }
  const m = MONTH_INDEX[label] ?? 0;
  return {
    from: new Date(Date.UTC(2026, m, 1)),
    to: new Date(Date.UTC(2026, m + 1, 0, 23, 59, 59)),
  };
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [spend, setSpend] = useState<WindsorRow[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [view, setView] = useState<'summary' | 'leads'>('leads');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supa = supabaseBrowser();
        const [{ data: leadRows }, { data: spendRows }] = await Promise.all([
          supa.from('leads').select('*').order('date_opted_in', { ascending: false }).limit(1000),
          supa.from('windsor_ad_spend').select('*').limit(5000),
        ]);
        if (cancelled) return;
        if (leadRows?.length) setLeads(leadRows as Lead[]);
        else setLeads(generateMockLeads(40));
        if (spendRows?.length) setSpend(spendRows as WindsorRow[]);
        else setSpend(generateMockSpend());
      } catch {
        if (!cancelled) {
          setLeads(generateMockLeads(40));
          setSpend(generateMockSpend());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    // Realtime subscription
    let channel: ReturnType<ReturnType<typeof supabaseBrowser>['channel']> | null = null;
    try {
      const supa = supabaseBrowser();
      channel = supa.channel('leads-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          supa.from('leads').select('*').order('date_opted_in', { ascending: false }).limit(1000)
            .then(({ data }) => { if (data?.length) setLeads(data as Lead[]); });
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
  }, []);

  const range = useMemo(() => monthRange(filters.month), [filters.month]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filters.month !== 'All 2026' && l.date_opted_in) {
        const t = new Date(l.date_opted_in).getTime();
        if (t < range.from.getTime() || t > range.to.getTime()) return false;
      }
      if (filters.score && String(l.app_grading) !== filters.score) return false;
      if (filters.stage && l.pipeline_stage !== filters.stage) return false;
      if (filters.introStatus && l.intro_show_status !== filters.introStatus) return false;
      if (filters.demoStatus && l.demo_show_status !== filters.demoStatus) return false;
      if (filters.closed === 'yes' && !l.client_closed) return false;
      if (filters.closed === 'no' && l.client_closed) return false;
      if (filters.closer && l.demo_assigned_closer !== filters.closer && l.intro_closer !== filters.closer) return false;
      if (filters.campaign && l.campaign_name !== filters.campaign) return false;
      return true;
    });
  }, [leads, filters, range]);

  const kpis: KPIStats = useMemo(() => computeKpis(filtered, spend, range), [filtered, spend, range]);

  const closers = useMemo(() => Array.from(new Set(leads.flatMap((l) => [l.intro_closer, l.demo_assigned_closer]).filter(Boolean) as string[])), [leads]);
  const campaigns = useMemo(() => Array.from(new Set(leads.map((l) => l.campaign_name).filter(Boolean) as string[])), [leads]);

  if (!loaded) return <div className="text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Filters value={filters} onChange={setFilters} closers={closers} campaigns={campaigns} />

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
        <KpiCard label="No-Show" value={kpis.introNoShow} accent="negative" />
        <KpiCard label="Cancelled" value={kpis.introCancelled} accent="negative" />
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
