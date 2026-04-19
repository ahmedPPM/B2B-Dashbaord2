import Link from 'next/link';
import { BarChart3, Waves, Clapperboard, ArrowRight } from 'lucide-react';

export default function Home() {
  const apps = [
    {
      href: '/dashboard',
      title: 'B2B Acquisition Dashboard',
      desc: 'Leads, appointments, calls, ads performance, and won clients.',
      icon: BarChart3,
      external: false,
    },
    {
      href: 'https://pool-agent-builder-production.up.railway.app',
      title: 'Pool Agent Builder — Before & After',
      desc: 'Find homeowners without pools, design their backyard, send postcards.',
      icon: Waves,
      external: true,
    },
    {
      href: 'https://avatar-forge-production.up.railway.app/',
      title: 'Avatar Forge — Ad Creative Studio',
      desc: 'Generate avatar-led video ads end-to-end with captions, film look, and branding.',
      icon: Clapperboard,
      external: true,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Premier Pool Marketing</div>
          <h1 className="text-3xl font-semibold">Welcome, Sir</h1>
          <p className="text-zinc-400 mt-2">Choose an app to access.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((a) => {
            const Icon = a.icon;
            const cls = 'group relative rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-emerald-700 transition p-6 flex flex-col gap-3';
            const content = (
              <>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-600/20 text-emerald-400">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-lg">{a.title}</div>
                </div>
                <p className="text-sm text-zinc-400">{a.desc}</p>
                <div className="flex items-center gap-1 text-sm text-emerald-400 mt-auto pt-2 opacity-0 group-hover:opacity-100 transition">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </>
            );
            return a.external ? (
              <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className={cls}>{content}</a>
            ) : (
              <Link key={a.href} href={a.href} className={cls}>{content}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
