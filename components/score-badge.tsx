import { cn } from '@/lib/utils';

const MAP: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-red-950/50', text: 'text-red-400', label: 'Trash' },
  2: { bg: 'bg-orange-950/50', text: 'text-orange-400', label: 'Weak' },
  3: { bg: 'bg-yellow-950/50', text: 'text-yellow-400', label: 'Good' },
  4: { bg: 'bg-emerald-950/50', text: 'text-emerald-400', label: 'Hot' },
};

export function ScoreBadge({ score }: { score: number | null }) {
  if (!score) return <span className="text-zinc-600 text-xs">—</span>;
  const m = MAP[score] || MAP[2];
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1', m.bg, m.text)}>
      <span>{score}</span>
      <span className="opacity-70">{m.label}</span>
    </span>
  );
}
