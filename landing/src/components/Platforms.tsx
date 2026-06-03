import type { JSX } from 'react'
import { APP_URL } from '../constants'
import { AndroidIcon, AppleIcon, GlobeIcon } from './icons'
import Reveal from './Reveal'

type Platform = {
  icon: (p: { className?: string }) => JSX.Element
  name: string
  status: string
  href?: string
}

const PLATFORMS: Platform[] = [
  { icon: GlobeIcon, name: 'Web app', status: 'In development (preview available)', href: APP_URL },
  { icon: AndroidIcon, name: 'Android', status: 'Coming soon' },
  { icon: AppleIcon, name: 'iPhone', status: 'Coming soon' },
]

export default function Platforms() {
  return (
    <section id="platforms" className="border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="font-mono text-sm uppercase tracking-widest text-accent-2">Platforms</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Where it runs</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PLATFORMS.map(({ icon: Icon, name, status, href }, i) => {
            const inner = (
              <>
                <Icon className={`h-8 w-8 ${href ? 'text-content' : 'text-dim'}`} />
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-lg font-semibold text-content">{name}</h3>
                  <span className={`text-sm ${href ? 'text-accent' : 'text-muted'}`}>{status}</span>
                </div>
              </>
            )
            const base = 'block h-full rounded-2xl border p-6 transition-colors'
            return (
              <Reveal key={name} delay={i * 90}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${base} border-accent/40 bg-surf/50 hover:border-accent hover:bg-surf-2/60`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className={`${base} border-border bg-surf/30`}>{inner}</div>
                )}
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
