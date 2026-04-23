'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Lead } from '@/lib/types';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

const DATE_RANGES = [
  { label: '7d', from: () => daysAgo(7), to: () => today() },
  { label: '30d', from: () => daysAgo(30), to: () => today() },
  { label: 'MTD', from: () => monthStart(), to: () => today() },
  { label: 'All', from: () => '2020-01-01', to: () => '2030-12-31' },
];

const TABS = ['All', 'New Leads', 'Intros', 'Demos', 'Closed', 'Lost'] as const;
type Tab = (typeof TABS)[number];

interface Comment {
  id: string;
  lead_id: string;
  text: string;
  author: string;
  created_at: string;
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function stageLabel(lead: Lead): string {
  if (lead.client_closed) return 'Closed';
  const stage = (lead.pipeline_stage || '').toLowerCase();
  if (stage.includes('lost')) return 'Lost';
  if (lead.demo_booked) return 'Demo';
  if (lead.intro_booked) return 'Intro';
  return 'New';
}

function stageBadgeClass(label: string): string {
  switch (label) {
    case 'Closed': return 'bg-emerald-500/20 text-emerald-400';
    case 'Lost': return 'bg-red-500/20 text-red-400';
    case 'Demo': return 'bg-blue-500/20 text-blue-400';
    case 'Intro': return 'bg-violet-500/20 text-violet-400';
    default: return 'bg-zinc-800 text-zinc-400';
  }
}

export default function ActivityPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('All');
  const [rangeIdx, setRangeIdx] = useState(2);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => r.json())
      .then((json) => setLeads(json.leads || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch comments when selected lead changes
  useEffect(() => {
    if (!selectedLead) { setComments([]); return; }
    fetch(`/api/comments?leadId=${selectedLead.id}`)
      .then((r) => r.json())
      .then((json) => setComments(json.comments || []))
      .catch(console.error);
  }, [selectedLead]);

  const range = DATE_RANGES[rangeIdx];

  const filteredLeads = useMemo(() => {
    const from = range.from();
    const to = range.to();

    let base = leads.filter((l) => {
      const d = (l.date_opted_in || '').slice(0, 10);
      return d >= from && d <= to;
    });

    switch (tab) {
      case 'New Leads':
        base = base.filter((l) => !l.intro_booked && !l.demo_booked);
        base.sort((a, b) => (b.date_opted_in || '').localeCompare(a.date_opted_in || ''));
        break;
      case 'Intros':
        base = base.filter((l) => l.intro_booked);
        base.sort((a, b) => (b.intro_booked_for_date || '').localeCompare(a.intro_booked_for_date || ''));
        break;
      case 'Demos':
        base = base.filter((l) => l.demo_booked);
        base.sort((a, b) => (b.demo_booked_for_date || '').localeCompare(a.demo_booked_for_date || ''));
        break;
      case 'Closed':
        base = base.filter((l) => l.client_closed);
        base.sort((a, b) => (b.date_opted_in || '').localeCompare(a.date_opted_in || ''));
        break;
      case 'Lost':
        base = base.filter((l) => {
          const stage = (l.pipeline_stage || '').toLowerCase();
          const tag = (l.lead_tag || '').toLowerCase();
          return stage.includes('lost') || tag.includes('lost');
        });
        base.sort((a, b) => (b.date_opted_in || '').localeCompare(a.date_opted_in || ''));
        break;
      default:
        base.sort((a, b) => (b.date_opted_in || '').localeCompare(a.date_opted_in || ''));
        break;
    }

    return base;
  }, [leads, tab, rangeIdx, range]);

  const handleSubmitComment = async () => {
    if (!selectedLead || !commentText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: selectedLead.id, text: commentText.trim() }),
      });
      const json = await res.json();
      if (json.ok && json.comment) {
        setComments((prev) => [json.comment, ...prev]);
        setCommentText('');
      }
    } catch (err) {
      console.error('comment submit', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">Activity Feed</h1>
        <div className="flex items-center gap-1.5">
          {DATE_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                rangeIdx === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Feed */}
        <div className="lg:col-span-2 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800 pb-0">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg transition border-b-2 ${
                  tab === t
                    ? 'text-zinc-100 border-emerald-500'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-zinc-500 text-sm">No leads for this filter.</div>
          ) : (
            <div className="card divide-y divide-zinc-800/60">
              {filteredLeads.slice(0, 100).map((lead) => {
                const label = stageLabel(lead);
                const badgeClass = stageBadgeClass(label);
                const isSelected = selectedLead?.id === lead.id;
                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(isSelected ? null : lead)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                      isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200 shrink-0">
                      {getInitials(lead.lead_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-100 truncate">
                        {lead.lead_name || '(no name)'}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {lead.email || '—'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
                        {label}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {lead.date_opted_in ? new Date(lead.date_opted_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Comments */}
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <div className="text-sm font-medium text-zinc-100">
              {selectedLead ? `Comment on ${selectedLead.lead_name || 'Lead'}` : 'Add Comment'}
            </div>
            {!selectedLead ? (
              <div className="text-xs text-zinc-500">Select a lead from the feed to add a comment.</div>
            ) : (
              <>
                <div className="text-xs text-zinc-400 bg-zinc-800/60 rounded-lg px-3 py-2 truncate">
                  {selectedLead.lead_name} · {selectedLead.email}
                </div>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  placeholder="Write a note…"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition"
                >
                  {submitting ? 'Saving…' : 'Post Comment'}
                </button>
              </>
            )}
          </div>

          {/* Recent comments */}
          {selectedLead && (
            <div className="card p-4 space-y-3">
              <div className="text-sm font-medium text-zinc-100">Recent Comments</div>
              {comments.length === 0 ? (
                <div className="text-xs text-zinc-500">No comments yet.</div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">{c.author}</span>
                        <span className="text-xs text-zinc-600">{formatRelative(c.created_at)}</span>
                      </div>
                      <div className="text-xs text-zinc-400 bg-zinc-900/60 rounded-lg px-3 py-2">
                        {c.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
