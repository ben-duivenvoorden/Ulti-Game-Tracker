/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the live web app (the React SPA) the landing page links to. */
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
