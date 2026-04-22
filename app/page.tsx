import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, Waves, Clapperboard, Target, ArrowUpRight } from 'lucide-react';

export default function Home() {
  const apps = [
    {
      href: '/dashboard',
      title: 'B2B Acquisition',
      tag: 'Dashboard',
      desc: 'Leads, appointments, calls, ads performance, and won clients — all in one operator view.',
      icon: BarChart3,
      accent: 'from-emerald-500/70 to-emerald-500/10',
      iconWrap: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
      external: false,
    },
    {
      href: 'https://pool-agent-builder-production.up.railway.app',
      title: 'Pool Agent Builder',
      tag: 'Before & After',
      desc: 'Find homeowners without pools, design their backyard, send postcards at scale.',
      icon: Waves,
      accent: 'from-sky-500/70 to-sky-500/10',
      iconWrap: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
      external: true,
    },
    {
      href: 'https://avatar-forge-production.up.railway.app/',
      title: 'Avatar Forge',
      tag: 'Ad Creative Studio',
      desc: 'Generate avatar-led video ads end-to-end with captions, film look, and brand overlays.',
      icon: Clapperboard,
      accent: 'from-violet-500/70 to-violet-500/10',
      iconWrap: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
      external: true,
    },
    {
      href: 'https://ppm-b2b-dashboard-pool-outreach.up.railway.app/',
      title: 'ICP Intelligence',
      tag: 'Pool Outreach',
      desc: 'Identify ideal customer profiles, enrich pool leads, and launch targeted outreach campaigns at scale.',
      icon: Target,
      accent: 'from-orange-500/70 to-orange-500/10',
      iconWrap: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
      external: true,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Ambient gradient wash — matches the logo's blue→violet palette. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-600/25 via-violet-600/20 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] translate-x-1/3 translate-y-1/3 rounded-full bg-violet-700/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[320px] w-[320px] -translate-x-1/3 translate-y-1/3 rounded-full bg-blue-700/20 blur-3xl" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-12 flex flex-col items-center text-center">
          <div className="relative mb-6 flex h-28 w-28 items-center justify-center rounded-2xl bg-white/95 p-3 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)] ring-1 ring-white/10">
            <Image
              src="/ppm-logo.webp"
              alt="Premier Pool Marketing"
              width={110}
              height={110}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-zinc-400">
            Premier Pool Marketing
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Welcome back, <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">sir</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-400 md:text-base">
            One control panel for the whole operation — pick where to go.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {apps.map((a) => {
            const Icon = a.icon;
            const body = (
              <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-zinc-900/80 hover:shadow-[0_20px_50px_-20px_rgba(99,102,241,0.35)]">
                {/* Top-edge gradient — unique color per app */}
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${a.accent}`} />
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-105 ${a.iconWrap}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-200" />
                </div>
                <div className="mt-5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">{a.tag}</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-50">{a.title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{a.desc}</p>
                </div>
              </div>
            );
            return a.external ? (
              <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className="group block">
                {body}
              </a>
            ) : (
              <Link key={a.href} href={a.href} className="group block">
                {body}
              </Link>
            );
          })}
        </div>

        <div className="mt-12 text-[11px] uppercase tracking-[0.25em] text-zinc-600">
          Built for operators · {new Date().getFullYear()}
        </div>
      </main>
    </div>
  );
}
