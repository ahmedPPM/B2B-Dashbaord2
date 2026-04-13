export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return Math.round((db.getTime() - da.getTime()) / 60000);
}

// Lightweight classname merger. Accepts strings, arrays, and truthy/falsy.
export function cn(
  ...args: Array<string | number | false | null | undefined | Array<string | false | null | undefined>>
): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (Array.isArray(a)) {
      for (const x of a) if (x) out.push(String(x));
    } else {
      out.push(String(a));
    }
  }
  return out.join(' ');
}
