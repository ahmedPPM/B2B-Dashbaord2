import { cn } from '@/lib/utils';

const STAGE_STYLES: Record<string, string> = {
  new_lead: 'bg-zinc-800 text-zinc-300',
  intro_booked: 'bg-blue-950/50 text-blue-300',
  intro_showed: 'bg-blue-900/50 text-blue-200',
  demo_booked: 'bg-purple-950/50 text-purple-300',
  demo_showed: 'bg-purple-900/50 text-purple-200',
  closed: 'bg-emerald-900/50 text-emerald-300',
  no_show: 'bg-orange-950/50 text-orange-300',
  dq: 'bg-red-950/50 text-red-300',
};

export function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-zinc-600 text-xs">—</span>;
  const cls = STAGE_STYLES[stage] || 'bg-zinc-800 text-zinc-300';
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cls)}>
      {stage.replace(/_/g, ' ')}
    </span>
  );
}
