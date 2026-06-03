import { APP_URL, GITHUB_URL } from '../constants'
import { ArrowRightIcon, GitHubIcon } from './icons'

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 sm:pt-36">
      {/* Layered atmosphere: two-stop indigo→cyan glow + faint dot grid. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-20%] h-[460px] w-[680px] -translate-x-1/2 rounded-full bg-accent/20 blur-[130px]" />
        <div className="absolute left-[58%] top-[-8%] h-[320px] w-[420px] -translate-x-1/2 rounded-full bg-accent-2/15 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--color-border-2) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage:
              'radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="animate-enter mb-6 inline-flex items-center gap-2 rounded-full border border-border-2 bg-surf/60 px-3.5 py-1.5 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
          In active development · v0.x
        </div>

        <h1
          className="animate-enter max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
          style={{ animationDelay: '60ms' }}
        >
          Track games{' '}
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            as fast as you can play them.
          </span>
        </h1>

        <p
          className="animate-enter mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl"
          style={{ animationDelay: '120ms' }}
        >
          A fast, offline-first web app that makes tracking a live game easy.
        </p>

        <div
          className="animate-enter mt-8 flex flex-col gap-3 sm:flex-row"
          style={{ animationDelay: '180ms' }}
        >
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-content shadow-lg shadow-accent/25 transition-colors hover:bg-accent/90"
          >
            Preview the web app
            <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-2 bg-surf/60 px-6 py-3 text-base font-semibold text-content transition-colors hover:bg-surf-2"
          >
            <GitHubIcon className="h-5 w-5" />
            GitHub
          </a>
        </div>

        <p
          className="animate-enter mt-5 text-sm text-dim"
          style={{ animationDelay: '240ms' }}
        >
          Native iOS &amp; Android apps coming soon.
        </p>
      </div>
    </section>
  )
}
