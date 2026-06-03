// Single source of truth for outbound links.
//
// The web-app URL is environment-configurable via `VITE_APP_URL` so the link
// resolves correctly in every context — local dev, a preview build, and the
// published site — without code changes. It falls back to the live app, which
// is the right target today (the app is served at the apex domain).
//
// When the landing page is itself published at `ultigametracker.com`, set
// `VITE_APP_URL` (e.g. in `.env`, `.env.local`, or a deploy/repo variable) to
// the app's URL so the button doesn't loop back to this page.
export const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://ultigametracker.com'

/** Public GitHub repository for the project. */
export const GITHUB_URL = 'https://github.com/ben-duivenvoorden/Ulti-Game-Tracker'
