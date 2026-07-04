import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the voice effort — wraps the existing Vite PWA. The web
// build and the Azure SWA deploy are untouched: `vite build` still emits
// `dist/`, and `npx cap sync android` copies that same output into the
// Android project. See design/ + the 2026-07-03 voice build brief.
const config: CapacitorConfig = {
  appId: 'com.ultigametracker.app',
  appName: 'Ulti Game Tracker',
  webDir: 'dist',
  // Matches --color-bg — shows through wherever the WebView doesn't paint.
  backgroundColor: '#111111',
  plugins: {
    // Android 15+ forces edge-to-edge; SystemBars injects the real
    // --safe-area-inset-* values (insetsHandling defaults to 'css') and
    // index.css pads the shell with them — works on any notch/ratio.
    // 'DARK' = light bar icons for the always-dark app.
    SystemBars: {
      style: 'DARK',
    },
  },
}

export default config
