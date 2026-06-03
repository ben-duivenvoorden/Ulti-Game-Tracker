import { APP_URL, GITHUB_URL } from '../constants'
import { ArrowRightIcon, GitHubIcon } from './icons'

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 sm:pt-36">
      {/* Subtle accent glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-20%] h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-2 bg-surf/60 px-3.5 py-1.5 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
          In active development · v0.x
        </div>

        <h1 className="max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          Track ultimate frisbee games, point by point.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          A fast, offline-first web app for recording ultimate frisbee games as
          they happen — every pass, point and turn — into a clean game log.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent/90"
          >
            Open the web app
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

        <p className="mt-5 text-sm text-dim">Native iOS &amp; Android apps coming soon.</p>
      </div>
    </section>
  )
}
