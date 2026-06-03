import { APP_URL, GITHUB_URL } from '../constants'
import Wordmark from './Wordmark'
import { GitHubIcon } from './icons'

// Sticky, translucent top bar. Section anchors collapse on small screens; the
// GitHub + Try-the-web-app actions stay visible at every width.
export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-bg/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label="Ulti Game Tracker — top">
          <Wordmark />
        </a>

        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#mission" className="transition-colors hover:text-content">Mission</a>
          <a href="#features" className="transition-colors hover:text-content">Features</a>
          <a href="#parity" className="transition-colors hover:text-content">Parity League</a>
          <a href="#platforms" className="transition-colors hover:text-content">Apps</a>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surf-2 hover:text-content"
            aria-label="View on GitHub"
          >
            <GitHubIcon className="h-5 w-5" />
          </a>
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent/90"
          >
            Try the web app
          </a>
        </div>
      </nav>
    </header>
  )
}
