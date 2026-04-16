'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Search, ArrowUp, ArrowDown, Calendar, UserCheck, UserX, Ban, Clock } from 'lucide-react';
import { useAdsOnly } from '@/lib/ads-only-context';
import { isFromAds } from '@/lib/is-paid';

interface Row {
  id: string;
  lead_id: string;
  lead_name: string | null;
  email: string | null;
  type: 'intro' | 'demo';
  booked_for: string | null;
  created_at: string | null;
  status: string | null;
  closer: string | null;
  assigned_user_name: string | null;
  campaign_name: string | null;
  lead_source: string | null;
  outcome: string | null;
}

interface Totals {
  total: number;
  intros: number;
  demos: number;
  showed: number;
  noshow: number;
  cancelled: number;
  upcoming: number;
}

interface CampaignBreak {
  campaign_name: string;
  total: number;
  intros: number;
  demos: number;
  showed: number;
  noshow: number;
  cancelled: number;
}

type SortKey = 'booked_for' | 'lead_name' | 'type' | 'status' | 'closer' | 'campaign_name';

// Appointments can be upcoming, so `to` extends into the future for period
// presets; the older "7d/30d" ranges stay bounded to today for past-only views.
const RANGES: Array<{ label: string; from: () => string; to: () => string }> = [
  { label: 'Upcoming', from: () => today(), to: () => '2030-12-31' },
  { label: 'Last 7d', from: () => isoDaysAgo(7), to: () => today() },
  { label: 'Last 30d', from: () => isoDaysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => '2030-12-31' },
  { label: 'YTD', from: () => '2026-01-01', to: () => '2030-12-31' },
  { label: 'All', from: () => '2020-01-01', to: () => '2030-12-31' },
];

export default function AppointmentsPage() {
  const [rangeIdx, setRangeIdx] = useState(4);
  const [typeFilter, setTypeFilter] = useState<'all' | 'intro' | 'demo'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'showed' | 'noshow' | 'cancelled' | 'scheduled'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignBreak[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('booked_for');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const { adsOnly } = useAdsOnly();

  useEffect(() => {
    const r = RANGES[rangeIdx];
    setLoading(true);
    fetch(`/api/appointments?from=${r.from()}&to=${r.to()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setRows(json.rows);
          setTotals(json.totals);
          setCampaigns(json.campaigns || []);
        }
      })
      .finally(() => setLoading(false));
  }, [rangeIdx]);

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (adsOnly && !isFromAds(r)) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all') {
        const s = (r.status || '').toLowerCase();
        if (statusFilter === 'showed' && !(s.includes('show') && !s.includes('no'))) return false;
        if (statusFilter === 'noshow' && !s.includes('no')) return false;
        if (statusFilter === 'cancelled' && !s.includes('cancel')) return false;
        if (statusFilter === 'scheduled' && (s.includes('show') || s.includes('no') || s.includes('cancel'))) return false;
      }
      if (!q) return true;
      return (
        (r.lead_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.closer || '').toLowerCase().includes(q) ||
        (r.assigned_user_name || '').toLowerCase().includes(q) ||
        (r.campaign_name || '').toLowerCase().includes(q)
      );
    });
    out = [...out].sort((a, b) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
      const as = String(av); const bs = String(bv);
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return out;
  }, [rows, search, typeFilter, statusFilter, sortKey, sortDir, adsOnly]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'booked_for' ? 'desc' : 'asc'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Appointments</h2>
        <div className="flex gap-1 flex-wrap">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-2 text-xs rounded min-h-[40px] ${i === rangeIdx ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi icon={Calendar} label="Total" value={totals.total} />
          <Kpi icon={Clock} label="Upcoming" value={totals.upcoming} />
          <Kpi label="Intros" value={totals.intros} />
          <Kpi label="Demos" value={totals.demos} />
          <Kpi icon={UserCheck} label="Showed" value={totals.showed} tone="ok" />
          <Kpi icon={UserX} label="No-show" value={totals.noshow} tone="warn" />
        </div>
      )}

      {/* Campaign breakdown */}
      {campaigns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-300">Appointments by Campaign</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 border-b border-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Campaign</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Total</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Intros</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Demos</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Showed</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">No-show</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Show %</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 15).map((c) => {
                  const denom = c.showed + c.noshow;
                  const showPct = denom ? (c.showed / denom) * 100 : 0;
                  return (
                    <tr key={c.campaign_name} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                      <td className="px-3 py-2 text-zinc-100">{c.campaign_name}</td>
                      <td className="px-3 py-2 text-right text-zinc-100 font-medium">{c.total}</td>
                      <td className="px-3 py-2 text-right text-zinc-300">{c.intros}</td>
                      <td className="px-3 py-2 text-right text-zinc-300">{c.demos}</td>
                      <td className="px-3 py-2 text-right text-emerald-400">{c.showed}</td>
                      <td className="px-3 py-2 text-right text-amber-400">{c.noshow}</td>
                      <td className="px-3 py-2 text-right text-zinc-300">{denom ? `${showPct.toFixed(0)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterGroup label="Type" value={typeFilter} options={['all', 'intro', 'demo']} onChange={(v) => setTypeFilter(v as typeof typeFilter)} />
        <FilterGroup label="Status" value={statusFilter} options={['all', 'scheduled', 'showed', 'noshow', 'cancelled']} onChange={(v) => setStatusFilter(v as typeof statusFilter)} />
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, closer, campaign…"
            className="input w-full pl-9"
          />
        </div>
      </div>
      <div className="text-xs text-zinc-500">{sortedFiltered.length} of {rows.length} appointments</div>

      {/* Main table */}
      <div className="card overflow-hidden">
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-zinc-800/50">
          {sortedFiltered.map((r) => (
            <Link key={r.id} href={`/dashboard/leads/${r.lead_id}`} className="block p-4 hover:bg-zinc-900/40">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-zinc-100 font-medium truncate">{r.lead_name || r.email || '—'}</div>
                  <div className="text-xs text-zinc-500 truncate">{formatDateTime(r.booked_for)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TypeBadge type={r.type} />
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-xs text-zinc-400">
                <div><span className="text-zinc-600">Closer:</span> {r.assigned_user_name || r.closer || '—'}</div>
                <div className="truncate"><span className="text-zinc-600">Campaign:</span> {r.campaign_name || '—'}</div>
              </div>
            </Link>
          ))}
          {!loading && sortedFiltered.length === 0 && (
            <div className="p-6 text-center text-zinc-500 text-sm">No appointments in this range.</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 border-b border-zinc-800">
              <tr>
                <SortTh k="booked_for" label="When" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="lead_name" label="Lead" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="closer" label="Closer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh k="campaign_name" label="Campaign" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{formatDateTime(r.booked_for)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/leads/${r.lead_id}`} className="text-zinc-100 hover:text-emerald-400">
                      {r.lead_name || r.email || '—'}
                    </Link>
                    {r.email && <div className="text-xs text-zinc-500">{r.email}</div>}
                  </td>
                  <td className="px-3 py-2"><TypeBadge type={r.type} /></td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-zinc-300">{r.assigned_user_name || r.closer || '—'}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.campaign_name || <span className="text-zinc-600">Unattributed</span>}</td>
                </tr>
              ))}
              {!loading && sortedFiltered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">No appointments in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string | number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-zinc-100';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1 text-xs rounded ${value === o ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function SortTh({ k, label, sortKey, sortDir, onSort }: { k: SortKey; label: string; sortKey: string; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2 text-left text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-800/40 ${active ? 'text-zinc-100' : 'text-zinc-500'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );
}

function TypeBadge({ type }: { type: 'intro' | 'demo' }) {
  const cls = type === 'intro'
    ? 'bg-sky-950/50 text-sky-300 border-sky-900/50'
    : 'bg-violet-950/50 text-violet-300 border-violet-900/50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs border ${cls}`}>{type}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-zinc-600 text-xs">—</span>;
  const s = status.toLowerCase();
  let cls = 'bg-zinc-800/50 text-zinc-300 border-zinc-700';
  if (s.includes('show') && !s.includes('no')) cls = 'bg-emerald-950/50 text-emerald-300 border-emerald-900/50';
  else if (s.includes('no')) cls = 'bg-amber-950/50 text-amber-300 border-amber-900/50';
  else if (s.includes('cancel')) cls = 'bg-red-950/50 text-red-300 border-red-900/50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs border ${cls}`}>{status}</span>;
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const dateStr = formatDate(d);
  const timeStr = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

function today() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
