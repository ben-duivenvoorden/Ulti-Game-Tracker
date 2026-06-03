import type { JSX } from 'react'
import { BoltIcon, CloudOffIcon, DatabaseIcon } from './icons'
import Reveal from './Reveal'

type Feature = { icon: (p: { className?: string }) => JSX.Element; title: string; body: string }

const FEATURES: Feature[] = [
  {
    icon: BoltIcon,
    title: 'Minimal-tap entry',
    body: 'Capture granular, per-pass detail — passes, assists, blocks, turns — in a couple of taps on your phone, at the speed of play.',
  },
  {
    icon: CloudOffIcon,
    title: 'Offline-first',
    body: 'Keeps working with no signal and syncs when you reconnect. Installable like a native app.',
  },
  {
    icon: DatabaseIcon,
    title: 'Structured data',
    body: 'An append-only event log: clean, exportable, analytics-ready.',
  },
]

export default function Features() {
  return (
    <section id="features" className="border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="font-mono text-sm uppercase tracking-widest text-accent-2">Features</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Built for the sideline</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 90}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surf/50 p-6 transition-colors hover:border-border-2 hover:bg-surf-2/60">
                {/* 1px top highlight for physical depth */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-2 to-transparent"
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-content">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
