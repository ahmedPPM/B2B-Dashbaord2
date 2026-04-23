'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CallAnalysis } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Search, Phone, Play, Sparkles, User, Mic, ChevronDown, ChevronRight, Loader2, ExternalLink } from 'lucide-react';
import { useAdsOnly } from '@/lib/ads-only-context';
import { matchesLeadFilter } from '@/lib/is-paid';

interface LeadWithCalls {
  id: string;
  ghl_contact_id?: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  assigned_user_name: string | null;
  campaign_name: string | null;
  pipeline_stage: string | null;
  intro_closer: string | null;
  demo_assigned_closer: string | null;
  date_opted_in: string | null;
  calls: CallAnalysis[];
  call_count: number;
  analyzed_count: number;
  last_call_date: string | null;
  has_intro: boolean;
  has_demo: boolean;
}

export default function CallsPage() {
  const [rows, setRows] = useState<LeadWithCalls[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeadWithCalls | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'intro' | 'demo'>('all');
  const [analyzing, setAnalyzing] = useState(false);
  const { mode } = useAdsOnly();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/calls');
      const json = await res.json();
      if (json.ok) setRows(json.rows as LeadWithCalls[]);
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/leads/${selected.id}/analyze-call`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        await load();
        const refreshed = (await (await fetch('/api/calls')).json()).rows.find((r: LeadWithCalls) => r.id === selected.id);
        if (refreshed) setSelected(refreshed);
      } else alert(data.error || 'Failed');
    } finally {
      setAnalyzing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesLeadFilter(r, mode)) return false;
      if (typeFilter === 'intro' && !r.has_intro) return false;
      if (typeFilter === 'demo' && !r.has_demo) return false;
      if (!q) return true;
      return (
        (r.lead_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.assigned_user_name || '').toLowerCase().includes(q) ||
        (r.campaign_name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, mode]);

  const totals = useMemo(() => ({
    leads: rows.length,
    calls: rows.reduce((n, r) => n + r.call_count, 0),
    analyzed: rows.reduce((n, r) => n + r.analyzed_count, 0),
  }), [rows]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Sales Calls</h2>
        <p className="text-sm text-zinc-500">Leads with recorded calls. Click a lead to listen, read transcripts, and see AI coaching analysis.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Kpi icon={User} label="Leads with calls" value={totals.leads} />
        <Kpi icon={Phone} label="Total calls" value={totals.calls} />
        <Kpi icon={Sparkles} label="Analyzed" value={totals.analyzed} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterGroup label="Has" value={typeFilter} options={['all', 'intro', 'demo']} onChange={(v) => setTypeFilter(v as typeof typeFilter)} />
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lead, closer, email, campaign…"
            className="input w-full pl-9"
          />
        </div>
      </div>

      <div className="text-xs text-zinc-500">{filtered.length} of {rows.length} leads</div>

      <div className="grid lg:grid-cols-[minmax(0,1fr),minmax(0,1.3fr)] gap-4">
        {/* Leads list */}
        <div className="card overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 border-b border-zinc-800 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Lead</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-zinc-500">Closer</th>
                <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Calls</th>
                <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-zinc-500">Last</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`border-b border-zinc-800/50 cursor-pointer ${selected?.id === r.id ? 'bg-emerald-950/30' : 'hover:bg-zinc-900/40'}`}
                >
                  <td className="px-3 py-2">
                    <div className="text-zinc-100">{r.lead_name || r.email || '—'}</div>
                    <div className="text-xs text-zinc-500 flex gap-1 mt-0.5">
                      {r.has_intro && <TypeBadge type="intro" mini />}
                      {r.has_demo && <TypeBadge type="demo" mini />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{r.assigned_user_name || r.intro_closer || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="text-zinc-100 font-medium">{r.call_count}</div>
                    {r.analyzed_count < r.call_count && (
                      <div className="text-xs text-amber-400">{r.call_count - r.analyzed_count} pending</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-400 whitespace-nowrap">{r.last_call_date ? formatDate(r.last_call_date) : '—'}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No leads match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className="card p-5 max-h-[calc(100vh-300px)] overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm text-center p-8">
              <div>
                <Mic className="w-10 h-10 mx-auto mb-2 text-zinc-700" />
                Pick a lead on the left to view their calls, recordings, transcripts, and AI analysis.
              </div>
            </div>
          ) : (
            <LeadCallsView lead={selected} onAnalyze={analyze} analyzing={analyzing} />
          )}
        </div>
      </div>
    </div>
  );
}

function LeadCallsView({ lead, onAnalyze, analyzing }: { lead: LeadWithCalls; onAnalyze: () => void; analyzing: boolean }) {
  const unanalyzed = lead.calls.filter((c) => !c.ai_summary && c.raw_transcript).length;
  const locId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;
  const ghlUrl =
    locId && lead.ghl_contact_id
      ? `https://app.gohighlevel.com/v2/location/${locId}/contacts/detail/${lead.ghl_contact_id}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            <Link href={`/dashboard/leads/${lead.id}`} className="text-zinc-100 hover:text-emerald-400">
              {lead.lead_name || lead.email || '—'}
            </Link>
          </h3>
          <div className="text-sm text-zinc-400 flex items-center gap-2 mt-0.5 flex-wrap">
            {lead.email && <span>{lead.email}</span>}
            {lead.assigned_user_name && <><span>•</span><span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{lead.assigned_user_name}</span></>}
            {lead.campaign_name && <><span>•</span><span>{lead.campaign_name}</span></>}
            {ghlUrl && (
              <>
                <span>•</span>
                <a href={ghlUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Open in GHL
                </a>
              </>
            )}
          </div>
        </div>
        {unanalyzed > 0 && (
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="btn btn-primary inline-flex items-center gap-2 whitespace-nowrap"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analyze {unanalyzed} call{unanalyzed > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="text-xs text-zinc-500">{lead.calls.length} call{lead.calls.length !== 1 ? 's' : ''}</div>

      <div className="space-y-3">
        {lead.calls.map((c, i) => <CallCard key={c.id} call={c} defaultOpen={i === 0} />)}
      </div>
    </div>
  );
}

function CallCard({ call, defaultOpen }: { call: CallAnalysis; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [showTranscript, setShowTranscript] = useState(false);
  const hasAi = !!call.ai_summary;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-900/40"
      >
        <div className="flex items-center gap-2 text-sm">
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
          <TypeBadge type={call.call_type} />
          <span className="text-zinc-300">{call.call_date ? formatDate(call.call_date) : 'Unknown date'}</span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400">{formatDuration(call.call_duration_seconds)}</span>
          {call.ai_call_quality_score != null && (
            <>
              <span className="text-zinc-500">•</span>
              <QualityPill score={call.ai_call_quality_score} />
            </>
          )}
          {!hasAi && call.raw_transcript && <span className="text-xs text-amber-500 ml-2">pending analysis</span>}
          {!call.raw_transcript && <span className="text-xs text-zinc-600 ml-2">no transcript</span>}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-3">
          {call.call_recording_url && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                <Play className="w-3 h-3" />Recording
              </div>
              <audio controls src={call.call_recording_url} className="w-full">
                Your browser doesn&apos;t support audio playback.
              </audio>
            </div>
          )}

          {hasAi && (
            <>
              <Section title="Summary" body={call.ai_summary} />
              <Section title="Lead insights" body={call.ai_lead_insights} />
              <Section title="Closer performance" body={call.ai_closer_performance} />
              <Section title="Buying signals" body={call.ai_buying_signals} tone="ok" />
              <Section title="Red flags" body={call.ai_red_flags} tone="warn" />
              <Section title="Coaching recommendations" body={call.ai_next_steps} tone="accent" />
            </>
          )}

          {call.raw_transcript && (
            <div>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-xs uppercase tracking-wider text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
              >
                {showTranscript ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Full transcript
              </button>
              {showTranscript && (
                <pre className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-950 rounded p-3 border border-zinc-800 max-h-96 overflow-y-auto">
                  {call.raw_transcript}
                </pre>
              )}
            </div>
          )}

          {!call.raw_transcript && !hasAi && (
            <div className="text-sm text-zinc-500 italic">No transcript or analysis available.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, body, tone }: { title: string; body: string | null; tone?: 'ok' | 'warn' | 'accent' }) {
  if (!body) return null;
  const border =
    tone === 'ok' ? 'border-emerald-900/50 bg-emerald-950/10' :
    tone === 'warn' ? 'border-amber-900/50 bg-amber-950/10' :
    tone === 'accent' ? 'border-sky-900/50 bg-sky-950/10' :
    'border-zinc-800';
  return (
    <div className={`rounded-lg border ${border} p-3`}>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <div className="text-sm text-zinc-200 whitespace-pre-wrap">{body}</div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">{label}</span>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-xs rounded ${value === o ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function TypeBadge({ type, mini }: { type: string; mini?: boolean }) {
  const cls =
    type === 'intro' ? 'bg-sky-950/50 text-sky-300 border-sky-900/50' :
    type === 'demo' ? 'bg-violet-950/50 text-violet-300 border-violet-900/50' :
    'bg-zinc-800/50 text-zinc-300 border-zinc-700';
  const size = mini ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs';
  return <span className={`inline-block rounded border ${cls} ${size}`}>{type}</span>;
}

function QualityPill({ score }: { score: number }) {
  const color = score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-zinc-300' : 'text-amber-400';
  return <span className={`${color} text-xs font-semibold`}>{score}/10</span>;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
