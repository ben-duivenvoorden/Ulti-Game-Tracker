// Single source of truth for outbound links.
//
// The app is served from the *same* Static Web App as this landing page, under
// the `/app/` path (the landing page is the apex root). A relative URL keeps it
// correct in every context — local combined preview, and the published site —
// without environment config. The trailing slash matches the SWA route so it
// doesn't 301-bounce.
export const APP_URL = '/app/'

/** True when the viewport is in portrait orientation. Portrait devices are
 *  already phone-shaped, so the preview skips the phone frame and opens the app
 *  full-screen; the framed modal is only used in landscape (desktop). */
export const isPortrait = () =>
  typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches

/** Public GitHub repository for the project. */
export const GITHUB_URL = 'https://github.com/ben-duivenvoorden/Ulti-Game-Tracker'
