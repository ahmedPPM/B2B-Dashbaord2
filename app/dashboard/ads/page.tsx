'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, DollarSign, MousePointerClick, Users, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useAdsOnly } from '@/lib/ads-only-context';

interface Row {
  campaign_id: string | null;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  intros_booked: number;
  demos_booked: number;
  clients_closed: number;
  cash_collected: number;
  mrr: number;
  hyros_revenue: number;
  cpl: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas_cash: number;
}

interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  intros_booked: number;
  demos_booked: number;
  clients_closed: number;
  cash_collected: number;
  mrr: number;
  hyros_revenue: number;
}

const RANGES: Array<{ label: string; from: () => string; to: () => string }> = [
  { label: 'Last 7d', from: () => isoDaysAgo(7), to: () => today() },
  { label: 'Last 30d', from: () => isoDaysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => today() },
  { label: 'YTD', from: () => '2026-01-01', to: () => today() },
];

type SortKey = keyof Row;

export default function AdsPage() {
  const [rangeIdx, setRangeIdx] = useState(3);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<Array<{ date: string; spend: number; clicks: number; impressions: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { adsOnly } = useAdsOnly();

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = adsOnly
      ? rows.filter((r) => (r.campaign_name || '').toLowerCase() !== 'unattributed' && !!(r.campaign_name || r.campaign_id))
      : rows;
    filtered = q
      ? filtered.filter((r) =>
          (r.campaign_name || '').toLowerCase().includes(q) ||
          (r.campaign_id || '').toLowerCase().includes(q))
      : filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av ?? ''); const bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rows, search, sortKey, sortDir, adsOnly]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  useEffect(() => {
    const range = RANGES[rangeIdx];
    setLoading(true);
    fetch(`/api/ads-performance?from=${range.from()}&to=${range.to()}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setRows(json.rows);
          setTotals(json.totals);
          setDaily(json.daily);
        }
      })
      .finally(() => setLoading(false));
  }, [rangeIdx]);

  const leadToCloseRate = totals && totals.leads ? (totals.clients_closed / totals.leads) * 100 : 0;
  const showRevenue = totals ? Math.max(totals.cash_collected, totals.hyros_revenue) : 0;
  const roas = totals && totals.spend ? showRevenue / totals.spend : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Ads Performance</h2>
        <div className="flex gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 text-xs rounded ${i === rangeIdx ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-zinc-500">Loading…</div>}

      {totals && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Spend" value={formatCurrency(totals.spend)} />
            <Kpi icon={MousePointerClick} label="Clicks" value={totals.clicks.toLocaleString()} sub={`CTR ${(totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0).toFixed(2)}%`} />
            <Kpi icon={Users} label="Leads" value={totals.leads.toLocaleString()} sub={`CPL ${formatCurrency(totals.leads ? totals.spend / totals.leads : 0)}`} />
            <Kpi icon={TrendingUp} label="ROAS" value={`${roas.toFixed(2)}x`} sub={`Rev ${formatCurrency(showRevenue)}`} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Impressions" value={totals.impressions.toLocaleString()} />
            <Kpi label="Intros Booked" value={totals.intros_booked} />
            <Kpi label="Demos Booked" value={totals.demos_booked} />
            <Kpi label="Clients Closed" value={totals.clients_closed} sub={`${leadToCloseRate.toFixed(1)}% of leads`} />
            <Kpi label="Hyros Revenue" value={formatCurrency(totals.hyros_revenue)} />
          </div>
        </>
      )}

      <div className="card p-4">
        <h3 className="text-sm font-medium mb-3 text-zinc-300">Daily Spend</h3>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#888" fontSize={11} />
              <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="spend" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
          <h3 className="text-sm font-medium text-zinc-300">By Campaign</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign…"
              className="input w-full pl-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 border-b border-zinc-800">
              <tr>
                <SortTh k="campaign_name" label="Campaign" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="spend" label="Spend" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="impressions" label="Impr" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="clicks" label="Clicks" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="ctr" label="CTR" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="cpc" label="CPC" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="leads" label="Leads" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="cpl" label="CPL" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="intros_booked" label="Intros" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="demos_booked" label="Demos" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="clients_closed" label="Closed" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="cpa" label="CPA" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="cash_collected" label="Cash" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="hyros_revenue" label="Hyros Rev" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="roas_cash" label="ROAS" right sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((r) => (
                <tr key={(r.campaign_id || '') + (r.campaign_name || '')} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-100">{r.campaign_name || <span className="text-zinc-500">Unattributed</span>}</td>
                  <Td>{formatCurrency(r.spend)}</Td>
                  <Td>{r.impressions.toLocaleString()}</Td>
                  <Td>{r.clicks.toLocaleString()}</Td>
                  <Td>{r.ctr.toFixed(2)}%</Td>
                  <Td>{formatCurrency(r.cpc)}</Td>
                  <Td>{r.leads}</Td>
                  <Td>{r.leads ? formatCurrency(r.cpl) : '—'}</Td>
                  <Td>{r.intros_booked}</Td>
                  <Td>{r.demos_booked}</Td>
                  <Td>{r.clients_closed}</Td>
                  <Td>{r.clients_closed ? formatCurrency(r.cpa) : '—'}</Td>
                  <Td>{formatCurrency(r.cash_collected)}</Td>
                  <Td>{formatCurrency(r.hyros_revenue)}</Td>
                  <Td>{r.spend ? `${r.roas_cash.toFixed(2)}x` : '—'}</Td>
                </tr>
              ))}
              {sortedFiltered.length === 0 && !loading && (
                <tr><td colSpan={15} className="px-3 py-6 text-center text-zinc-500">No data in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function SortTh<K extends string>({ k, label, right, sortKey, sortDir, onSort }: {
  k: K; label: string; right?: boolean; sortKey: string; sortDir: 'asc' | 'desc'; onSort: (k: K) => void;
}) {
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
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right text-zinc-300 whitespace-nowrap">{children}</td>;
}

function today() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
