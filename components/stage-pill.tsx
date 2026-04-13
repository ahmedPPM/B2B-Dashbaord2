import { cn } from '@/lib/utils';

function colorFor(name: string): string {
  const n = name.toLowerCase();
  if (/won|closed|onboard/.test(n)) return 'bg-emerald-900/50 text-emerald-300';
  if (/dq|not interested|wrong/.test(n)) return 'bg-red-950/50 text-red-300';
  if (/no show|nurture/.test(n)) return 'bg-orange-950/50 text-orange-300';
  if (/demo/.test(n)) return 'bg-purple-950/50 text-purple-300';
  if (/intro/.test(n)) return 'bg-blue-950/50 text-blue-300';
  if (/setting|closing|check/.test(n)) return 'bg-amber-950/50 text-amber-300';
  return 'bg-zinc-800 text-zinc-300';
}

export function StagePill({ stage, name }: { stage?: string | null; name?: string | null }) {
  const label = name || stage;
  if (!label) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colorFor(label))}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}
