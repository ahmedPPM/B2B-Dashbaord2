'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Lead, WindsorRow, KPIStats } from '@/lib/types';
import { computeKpis } from '@/lib/kpis';
import { useAdsOnly } from '@/lib/ads-only-context';
import { isFromAds } from '@/lib/is-paid';
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
  const { adsOnly } = useAdsOnly();

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  const range = useMemo(() => monthRange(filters.month), [filters.month]);

  const filtered = useMemo(() => {
    const matchStatus = (val: string | null | undefined, pick: string) => {
      const v = (val || '').toLowerCase();
      // Normalize to buckets so "Cancelled"/"cancelled", "Showed"/"showed" match.
      if (pick === 'showed') return v.includes('show') && !v.includes('no');
      if (pick === 'noshow') return v.includes('no') && v.includes('show');
      if (pick === 'cancelled') return v.includes('cancel');
      if (pick === 'scheduled') return v === 'scheduled' || v === 'confirmed' || v === 'new';
      return v === pick.toLowerCase();
    };
    return leads.filter((l) => {
      if (adsOnly && !isFromAds(l)) return false;
      if (l.date_opted_in) {
        const t = new Date(l.date_opted_in).getTime();
        if (t < range.from.getTime() || t > range.to.getTime()) return false;
      }
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
  }, [leads, filters, range, adsOnly]);

  const kpis: KPIStats = useMemo(() => computeKpis(filtered, spend, range), [filtered, spend, range]);

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
      <Filters value={filters} onChange={setFilters} closers={closers} campaigns={campaigns} stages={stages} />

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
