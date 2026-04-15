'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Lead } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Search, ArrowUp, ArrowDown, DollarSign, Users, Target, TrendingUp } from 'lucide-react';
import { useAdsOnly } from '@/lib/ads-only-context';

type SortKey = 'client_closed_date' | 'date_opted_in' | 'lead_name' | 'cash_collected' | 'contracted_mrr' | 'campaign_name' | 'assigned_user_name';

interface Totals {
  all: number;
  from_ads: number;
  organic: number;
  cash_all: number;
  cash_from_ads: number;
  cash_organic: number;
  mrr_all: number;
  mrr_from_ads: number;
  mrr_organic: number;
}

export default function ClientsPage() {
  const [fromAds, setFromAds] = useState<Lead[]>([]);
  const [organic, setOrganic] = useState<Lead[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'from_ads' | 'organic' | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('client_closed_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const { adsOnly } = useAdsOnly();

  useEffect(() => { if (adsOnly) setView('from_ads'); }, [adsOnly]);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/clients');
      const json = await res.json();
      if (json.ok) {
        setFromAds(json.from_ads as Lead[]);
        setOrganic(json.organic as Lead[]);
        setTotals(json.totals as Totals);
      }
    } finally { setLoading(false); }
  }

  const active = useMemo(() => {
    if (view === 'from_ads') return fromAds;
    if (view === 'organic') return organic;
    return [...fromAds, ...organic];
  }, [view, fromAds, organic]);

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? active.filter((l) =>
          (l.lead_name || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.campaign_name || '').toLowerCase().includes(q) ||
          (l.assigned_user_name || '').toLowerCase().includes(q))
      : active;
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av ?? ''); const bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [active, search, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const avgDealAll = totals && totals.all ? totals.cash_all / totals.all : 0;
  const avgDealAds = totals && totals.from_ads ? totals.cash_from_ads / totals.from_ads : 0;
  const avgDealOrg = totals && totals.organic ? totals.cash_organic / totals.organic : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Won Clients</h2>
        <p className="text-sm text-zinc-500">All closed clients — split by ad-sourced vs organic.</p>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Users} label="Total Clients" value={totals.all} sub={`${totals.from_ads} ads • ${totals.organic} organic`} />
          <Kpi icon={DollarSign} label="Total Cash" value={formatCurrency(totals.cash_all)} sub={`MRR ${formatCurrency(totals.mrr_all)}`} />
          <Kpi icon={Target} label="From Ads" value={formatCurrency(totals.cash_from_ads)} sub={`Avg ${formatCurrency(avgDealAds)}`} tone="ok" />
          <Kpi icon={TrendingUp} label="Organic" value={formatCurrency(totals.cash_organic)} sub={`Avg ${formatCurrency(avgDealOrg)}`} />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {(['all', 'from_ads', 'organic'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs rounded ${view === v ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
            >
              {v === 'all' ? 'All' : v === 'from_ads' ? 'From Ads' : 'Organic'}
              <span className="ml-1.5 text-[10px] opacity-60">
                {v === 'all' ? totals?.all : v === 'from_ads' ? totals?.from_ads : totals?.organic}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, campaign, closer…"
            className="input w-full pl-9"
          />
        </div>
      </div>
      <div className="text-xs text-zinc-500">{sortedFiltered.length} of {active.length} clients</div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 border-b border-zinc-800">
              <tr>
                <SortTh k="lead_name" label="Client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Source</th>
                <SortTh k="campaign_name" label="Campaign" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="assigned_user_name" label="Closer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="client_closed_date" label="Won" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="date_opted_in" label="First Contact" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="cash_collected" label="Cash" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="contracted_mrr" label="MRR" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((l) => {
                const fromAds = !!(l.campaign_name || l.campaign_id);
                return (
                  <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/leads/${l.id}`} className="text-zinc-100 hover:text-emerald-400">
                        {l.lead_name || l.email || '—'}
                      </Link>
                      <div className="text-xs text-zinc-500">{l.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge fromAds={fromAds} source={l.lead_source} />
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{l.campaign_name || <span className="text-zinc-600">—</span>}</td>
                    <td className="px-3 py-2 text-zinc-300">{l.assigned_user_name || l.demo_assigned_closer || l.intro_closer || '—'}</td>
                    <td className="px-3 py-2 text-emerald-400 whitespace-nowrap font-medium">{formatDate(l.client_closed_date || null) || '—'}</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{formatDate(l.date_opted_in)}</td>
                    <td className="px-3 py-2 text-right text-zinc-100 font-medium">{formatCurrency(l.cash_collected)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(l.contracted_mrr)}</td>
                  </tr>
                );
              })}
              {!loading && sortedFiltered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-500">No clients match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-zinc-500 pt-4">
        Avg deal: {formatCurrency(avgDealAll)} overall • {formatCurrency(avgDealAds)} from ads • {formatCurrency(avgDealOrg)} organic.
        Includes any lead with client_closed=true or cash_collected &gt; 0. Historical won_client GHL contacts can be imported via Admin → Backfill.
      </div>
    </div>
  );
}

function SourceBadge({ fromAds, source }: { fromAds: boolean; source: string | null }) {
  if (fromAds) return <span className="inline-block px-2 py-0.5 rounded text-xs border bg-emerald-950/50 text-emerald-300 border-emerald-900/50">Ads</span>;
  return <span className="inline-block px-2 py-0.5 rounded text-xs border bg-zinc-800/50 text-zinc-300 border-zinc-700">{source || 'Organic'}</span>;
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string; tone?: 'ok' }) {
  const color = tone === 'ok' ? 'text-emerald-400' : 'text-zinc-100';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function SortTh({ k, label, right, sortKey, sortDir, onSort }: { k: SortKey; label: string; right?: boolean; sortKey: string; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2 text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-800/40 ${right ? 'text-right' : 'text-left'} ${active ? 'text-zinc-100' : 'text-zinc-500'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );
}
