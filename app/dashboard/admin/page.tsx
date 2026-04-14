import Link from 'next/link';

export default function AdminIndex() {
  const links = [
    { href: '/dashboard/admin/backfill', label: 'Backfill', desc: 'Run data backfill from GHL, Calendly, Typeform, Hyros' },
  ];

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Admin</h1>
      <div className="space-y-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block p-4 rounded border border-neutral-800 hover:border-neutral-600 transition"
          >
            <div className="font-medium">{l.label}</div>
            <div className="text-sm text-neutral-400">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
