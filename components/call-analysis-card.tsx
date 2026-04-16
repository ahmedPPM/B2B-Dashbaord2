import type { CallAnalysis } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import {
  FileText, Lightbulb, TrendingUp, AlertTriangle,
  UserCheck, ArrowRight, Star, Phone, ExternalLink,
} from 'lucide-react';

export function CallAnalysisCard({ analysis }: { analysis: CallAnalysis }) {
  const pending = !analysis.analyzed_at;
  const locId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;
  const ghlUrl =
    locId && analysis.ghl_contact_id
      ? `https://app.gohighlevel.com/v2/location/${locId}/contacts/detail/${analysis.ghl_contact_id}`
      : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium capitalize">{analysis.call_type} Call</span>
          <span className="text-xs text-zinc-500">· {formatDate(analysis.call_date)}</span>
        </div>
        <div className="flex items-center gap-3">
          {ghlUrl && (
            <a
              href={ghlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> View in GHL
            </a>
          )}
          {analysis.ai_call_quality_score && (
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-4 h-4 fill-current" />
              <span className="text-sm font-medium">{analysis.ai_call_quality_score}/10</span>
            </div>
          )}
        </div>
      </div>

      {pending ? (
        <div className="text-sm text-zinc-500 italic">Pending analysis.</div>
      ) : (
        <>
          {analysis.ai_summary && (
            <Section icon={<FileText className="w-4 h-4" />} title="Summary">
              <p className="text-sm text-zinc-300">{analysis.ai_summary}</p>
            </Section>
          )}
          {analysis.ai_lead_insights && (
            <Section icon={<Lightbulb className="w-4 h-4" />} title="Lead Insights">
              <p className="text-sm text-zinc-300">{analysis.ai_lead_insights}</p>
            </Section>
          )}
          {analysis.ai_buying_signals && (
            <Section icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} title="Buying Signals" color="text-emerald-300">
              <p className="text-sm text-emerald-200/90">{analysis.ai_buying_signals}</p>
            </Section>
          )}
          {analysis.ai_red_flags && (
            <Section icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Red Flags" color="text-red-300">
              <p className="text-sm text-red-200/90">{analysis.ai_red_flags}</p>
            </Section>
          )}
          {analysis.ai_closer_performance && (
            <Section icon={<UserCheck className="w-4 h-4" />} title="Closer Performance">
              <p className="text-sm text-zinc-300">{analysis.ai_closer_performance}</p>
            </Section>
          )}
          {analysis.ai_next_steps && (
            <Section icon={<ArrowRight className="w-4 h-4" />} title="Next Steps">
              <p className="text-sm text-zinc-300">{analysis.ai_next_steps}</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  icon, title, color, children,
}: { icon: React.ReactNode; title: string; color?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wider mb-1 ${color || 'text-zinc-500'}`}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}
