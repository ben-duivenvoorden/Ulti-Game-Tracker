import { GITHUB_URL } from '../constants'
import Wordmark from './Wordmark'
import { GitHubIcon } from './icons'

export default function Footer() {
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
        <Wordmark className="text-sm" />

        <div className="flex items-center gap-6 text-sm text-muted">
          <a href="/" className="transition-colors hover:text-content">
            ultigametracker.com
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-content"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
        </div>

        <p className="text-sm text-dim">© {new Date().getFullYear()} Ulti Game Tracker</p>
      </div>
    </footer>
  )
}
