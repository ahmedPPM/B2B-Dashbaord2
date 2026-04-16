'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Lead, CallAnalysis, HyrosAttribution } from '@/lib/types';
import { CallAnalysisCard } from '@/components/call-analysis-card';
import { HyrosCard } from '@/components/hyros-card';
import { ScoreBadge } from '@/components/score-badge';
import { StagePill } from '@/components/stage-pill';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, Phone, Mail, Play, Loader2, CalendarClock, Trash2, RotateCcw, Link2, Sparkles } from 'lucide-react';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [lead, setLead] = useState<Lead | null>(null);
  const [calls, setCalls] = useState<CallAnalysis[]>([]);
  const [hyros, setHyros] = useState<HyrosAttribution | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      const res = await fetch(`/api/leads/${id}?includeDeleted=true`);
      // Lead detail route doesn't filter by deleted, so just GET directly
      const directRes = await fetch(`/api/leads/${id}`);
      const json = await directRes.json().catch(() => null) || await res.json();
      if (json?.ok && json.lead) {
        setLead(json.lead as Lead);
        setCalls((json.calls || []) as CallAnalysis[]);
        if ((json.lead as Lead).email) {
          try {
            const hres = await fetch(`/api/leads/${id}/hyros`);
            if (hres.ok) {
              const hjson = await hres.json();
              if (hjson?.hyros) setHyros(hjson.hyros as HyrosAttribution);
            }
          } catch (e) { console.error('hyros fetch', e); }
        }
      }
    } catch (e) {
      console.error('lead detail fetch', e);
    }
  }

  async function savePatch(patch: Record<string, unknown>) {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    const data = await res.json();
    if (data.ok) {
      setLead(data.lead as Lead);
      setMsg(`Saved: ${Object.keys(patch).join(', ')}`);
    } else {
      setMsg(data.error || 'Save failed');
    }
  }

  async function onDelete() {
    if (!confirm('Delete this lead? It will be hidden but restorable from Activity Log.')) return;
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) router.push('/dashboard/leads');
    else setMsg(data.error || 'Delete failed');
  }

  async function onRestore() {
    const res = await fetch(`/api/leads/${id}?restore=true`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) load();
    else setMsg(data.error || 'Restore failed');
  }

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

  const isDeleted = !!(lead as Lead & { deleted_at?: string | null }).deleted_at;
  const introCalIds = (process.env.NEXT_PUBLIC_GHL_INTRO_CALENDAR_IDS || '0cPxjhApUzQ83lW2bQmt,vgek7QKnwcUvQcNIbepL').split(',');

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/leads" className="text-sm text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />All leads
        </Link>
        {isDeleted ? (
          <button onClick={onRestore} className="btn inline-flex items-center gap-2 text-emerald-400">
            <RotateCcw className="w-4 h-4" />Restore
          </button>
        ) : (
          <button onClick={onDelete} className="btn inline-flex items-center gap-2 text-red-400 hover:bg-red-950/30">
            <Trash2 className="w-4 h-4" />Delete
          </button>
        )}
      </div>

      {isDeleted && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          This lead is deleted. It's hidden from the main list.
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <EditableText value={lead.lead_name || ''} onSave={(v) => savePatch({ lead_name: v })} className="text-xl font-semibold" placeholder="Name" />
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
              <Mail className="w-3.5 h-3.5" />
              <EditableText value={lead.email || ''} onSave={(v) => savePatch({ email: v.toLowerCase() })} placeholder="email" />
              <Phone className="w-3.5 h-3.5" />
              <EditableText value={lead.phone || ''} onSave={(v) => savePatch({ phone: v })} placeholder="phone" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={lead.app_grading} />
            <StagePill stage={lead.pipeline_stage} name={(lead as Lead & { stage_name?: string; pipeline_name?: string }).stage_name} />
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm">
          <Field label="Created On" value={formatDate(lead.date_opted_in)} />
          <EditableField label="Source" value={lead.lead_source || ''} placeholder="Organic" onSave={(v) => savePatch({ lead_source: v || null })} />
          <Field label="Closer" value={lead.assigned_user_name || '—'} />
          <Field label="Campaign" value={lead.campaign_name || '—'} />

          <Field label="Intro Booked" value={lead.intro_booked ? formatDate(lead.intro_booked_for_date) : '—'} />
          <Field label="Intro Status" value={lead.intro_show_status || '—'} />
          <Field label="Intro Closer" value={lead.intro_closer || '—'} />
          <Field label="Intro Outcome" value={lead.intro_call_outcome || '—'} />

          <Field label="Demo Booked" value={lead.demo_booked ? formatDate(lead.demo_booked_for_date) : '—'} />
          <Field label="Demo Status" value={lead.demo_show_status || '—'} />
          <Field label="Demo Closer" value={lead.demo_assigned_closer || '—'} />
          <Field label="Demo Outcome" value={lead.demo_call_outcome || '—'} />

          <EditableField label="Closed" value={lead.client_closed ? 'Yes' : 'No'} onSave={(v) => savePatch({ client_closed: /^y/i.test(v) })} placeholder="Yes/No" />
          <EditableField label="Cash" value={lead.cash_collected ? String(lead.cash_collected) : ''} onSave={(v) => savePatch({ cash_collected: v ? Number(v) : null })} placeholder="0" numeric />
          <EditableField label="MRR" value={lead.contracted_mrr ? String(lead.contracted_mrr) : ''} onSave={(v) => savePatch({ contracted_mrr: v ? Number(v) : null })} placeholder="0" numeric />
          <EditableField label="Why Not Close" value={lead.why_didnt_close || ''} onSave={(v) => savePatch({ why_didnt_close: v || null })} placeholder="—" />
        </dl>

        {msg && <div className="mt-3 text-xs text-zinc-400">{msg}</div>}
      </div>

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

      <FathomCard leadId={id} />

      <HyrosCard data={hyros} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Call Analyses</h3>
        <button onClick={triggerAnalyze} disabled={analyzing} className="btn btn-primary inline-flex items-center gap-2">
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Analyze Calls
        </button>
      </div>

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

function EditableField({ label, value, onSave, placeholder, numeric }: { label: string; value: string; onSave: (v: string) => void | Promise<void>; placeholder?: string; numeric?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 mt-0.5">
        <EditableText value={value} onSave={onSave} placeholder={placeholder} numeric={numeric} />
      </dd>
    </div>
  );
}

function EditableText({ value, onSave, placeholder, className, numeric }: { value: string; onSave: (v: string) => void | Promise<void>; placeholder?: string; className?: string; numeric?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        type={numeric ? 'text' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          setEditing(false);
          if (draft !== value) await onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        className={`input ${className || ''}`}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-text hover:bg-zinc-900/60 rounded px-1 -mx-1 ${className || ''}`}
      title="Click to edit"
    >
      {value || <span className="text-zinc-600">{placeholder || '—'}</span>}
    </span>
  );
}

function FathomCard({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [call, setCall] = useState<CallAnalysis | null>(null);
  const [url, setUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/fathom-call`);
        const json = await res.json();
        if (json?.ok && json.call) {
          setCall(json.call as CallAnalysis);
          setUrl((json.call as CallAnalysis).call_recording_url || '');
          setTranscript((json.call as CallAnalysis).raw_transcript || '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId]);

  async function save(analyze: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/fathom-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url || null, transcript: transcript || null, analyze }),
      });
      const json = await res.json();
      if (json?.ok) setCall(json.call as CallAnalysis);
      else alert(json.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-emerald-400" />
        <h3 className="font-medium">Demo Call (Fathom)</h3>
        {call?.analyzed_at && <span className="text-xs text-emerald-400 ml-auto">AI analyzed</span>}
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-500">Fathom URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://fathom.video/calls/…"
              className="input w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-500">Transcript</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste Fathom transcript here. Leave blank if URL-only."
              rows={6}
              className="input w-full font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => save(false)}
              disabled={saving || (!url && !transcript)}
              className="btn inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving || !transcript}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Save & Analyze
            </button>
            {call?.call_recording_url && (
              <a
                href={call.call_recording_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-emerald-400 hover:text-emerald-300 ml-auto inline-flex items-center gap-1"
              >
                <Play className="w-3 h-3" />Open in Fathom
              </a>
            )}
          </div>

          {call?.ai_summary && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <FathomSection title="Summary" body={call.ai_summary} />
              <FathomSection title="Lead insights" body={call.ai_lead_insights} />
              <FathomSection title="Closer performance" body={call.ai_closer_performance} />
              <FathomSection title="Buying signals" body={call.ai_buying_signals} tone="ok" />
              <FathomSection title="Red flags" body={call.ai_red_flags} tone="warn" />
              <FathomSection title="Coaching recommendations" body={call.ai_next_steps} tone="accent" />
              {call.ai_call_quality_score != null && (
                <div className="text-sm">
                  <span className="text-zinc-500">Call quality: </span>
                  <span className="text-zinc-100 font-semibold">{call.ai_call_quality_score}/10</span>
                </div>
              )}
              {call.raw_transcript && (
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {showTranscript ? 'Hide' : 'Show'} full transcript
                </button>
              )}
              {showTranscript && call.raw_transcript && (
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-950 rounded p-3 border border-zinc-800 max-h-96 overflow-y-auto">
                  {call.raw_transcript}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FathomSection({ title, body, tone }: { title: string; body: string | null; tone?: 'ok' | 'warn' | 'accent' }) {
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

function ApptBlock({ title, source, date, status }: { title: string; source: string; date: string | null; status: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <div className="text-zinc-200">{date ? formatDate(date) : '—'}</div>
      <div className="text-xs text-zinc-500 mt-1">Source: {source} {status ? `• ${status}` : ''}</div>
    </div>
  );
}
