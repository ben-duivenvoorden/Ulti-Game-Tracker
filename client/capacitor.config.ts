import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the voice effort — wraps the existing Vite PWA. The web
// build and the Azure SWA deploy are untouched: `vite build` still emits
// `dist/`, and `npx cap sync android` copies that same output into the
// Android project. See design/ + the 2026-07-03 voice build brief.
const config: CapacitorConfig = {
  appId: 'com.ultigametracker.app',
  appName: 'Ulti Game Tracker',
  webDir: 'dist',
}

export default config
