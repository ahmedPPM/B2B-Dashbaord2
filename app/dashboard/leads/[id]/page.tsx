'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Lead, CallAnalysis, HyrosAttribution } from '@/lib/types';
import { generateMockLeads } from '@/lib/mock-data';
import { CallAnalysisCard } from '@/components/call-analysis-card';
import { HyrosCard } from '@/components/hyros-card';
import { ScoreBadge } from '@/components/score-badge';
import { StagePill } from '@/components/stage-pill';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, Phone, Mail, Play, Loader2, CalendarClock } from 'lucide-react';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<Lead | null>(null);
  const [calls, setCalls] = useState<CallAnalysis[]>([]);
  const [hyros, setHyros] = useState<HyrosAttribution | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/leads/${id}`);
        const json = await res.json();
        if (json?.ok && json.lead) {
          setLead(json.lead as Lead);
          setCalls((json.calls || []) as CallAnalysis[]);
          const email = (json.lead as Lead).email;
          if (email) {
            try {
              const hres = await fetch(`/api/leads/${id}/hyros`);
              if (hres.ok) {
                const hjson = await hres.json();
                if (hjson?.hyros) setHyros(hjson.hyros as HyrosAttribution);
              }
            } catch (e) {
              console.error('hyros fetch', e);
            }
          }
        } else {
          const mock = generateMockLeads(40).find((l) => l.id === id) || generateMockLeads(1)[0];
          setLead(mock);
        }
      } catch (e) {
        console.error('lead detail fetch', e);
        const mock = generateMockLeads(1)[0];
        setLead(mock);
      }
    })();
  }, [id]);

  async function triggerAnalyze() {
    setAnalyzing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leads/${id}/analyze-call`, { method: 'POST' });
      const data = await res.json();
      setMsg(data.ok ? `Analyzed ${data.count} call(s).` : data.error || 'Error');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setAnalyzing(false);
    }
  }

  if (!lead) return <div className="text-zinc-500">Loading…</div>;

  const introCalIds = (process.env.NEXT_PUBLIC_GHL_INTRO_CALENDAR_IDS || '0cPxjhApUzQ83lW2bQmt,vgek7QKnwcUvQcNIbepL').split(',');
  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" />Back to dashboard
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{lead.lead_name || '—'}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
              {lead.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{lead.email}</span>}
              {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{lead.phone}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={lead.app_grading} />
            <StagePill stage={lead.pipeline_stage} />
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm">
          <Field label="Opted In" value={formatDate(lead.date_opted_in)} />
          <Field label="Source" value={lead.lead_source || '—'} />
          <Field label="Campaign" value={lead.campaign_name || '—'} />
          <Field label="Speed to Lead" value={lead.speed_to_lead_minutes ? `${lead.speed_to_lead_minutes} min` : '—'} />

          <Field label="Intro Booked" value={lead.intro_booked ? formatDate(lead.intro_booked_for_date) : '—'} />
          <Field label="Intro Status" value={lead.intro_show_status || '—'} />
          <Field label="Intro Closer" value={lead.intro_closer || '—'} />
          <Field label="Intro Outcome" value={lead.intro_call_outcome || '—'} />

          <Field label="Demo Booked" value={lead.demo_booked ? formatDate(lead.demo_booked_for_date) : '—'} />
          <Field label="Demo Status" value={lead.demo_show_status || '—'} />
          <Field label="Demo Closer" value={lead.demo_assigned_closer || '—'} />
          <Field label="Demo Outcome" value={lead.demo_call_outcome || '—'} />

          <Field label="Closed" value={lead.client_closed ? 'Yes' : 'No'} />
          <Field label="Cash" value={formatCurrency(lead.cash_collected)} />
          <Field label="MRR" value={formatCurrency(lead.contracted_mrr)} />
          <Field label="Why Not Close" value={lead.why_didnt_close || '—'} />
        </dl>
      </div>

      {/* Appointments card */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-emerald-400" />
          <h3 className="font-medium">Appointments</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <ApptBlock
            title="Intro Call"
            source={lead.intro_booked ? (introCalIds.length > 1 ? 'GHL / Calendly' : 'GHL') : '—'}
            date={lead.intro_booked_for_date}
            status={lead.intro_show_status}
          />
          <ApptBlock
            title="Demo Call"
            source={lead.demo_booked ? 'GHL' : '—'}
            date={lead.demo_booked_for_date}
            status={lead.demo_show_status}
          />
        </div>
      </div>

      <HyrosCard data={hyros} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Call Analyses</h3>
        <button
          onClick={triggerAnalyze}
          disabled={analyzing}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Analyze Calls
        </button>
      </div>

      {msg && <div className="text-sm text-zinc-400">{msg}</div>}

      {calls.length === 0 ? (
        <div className="card p-6 text-center text-zinc-500 text-sm">No call data yet for this lead.</div>
      ) : (
        <div className="space-y-3">
          {calls.map((c) => <CallAnalysisCard key={c.id} analysis={c} />)}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 mt-0.5">{value}</dd>
    </div>
  );
}

function ApptBlock({ title, source, date, status }: { title: string; source: string; date: string | null; status: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <div className="text-zinc-200">{date ? formatDate(date) : '—'}</div>
      <div className="text-xs text-zinc-500 mt-1">Source: {source} {status ? `• ${status}` : ''}</div>
    </div>
  );
}
