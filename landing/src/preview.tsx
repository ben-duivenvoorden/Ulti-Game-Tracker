import { createContext, useCallback, useContext, useState, type ReactNode, type MouseEvent } from 'react'
import { APP_URL, isPortrait } from './constants'
import PhonePreview from './components/PhonePreview'

// Shared entry point for "Preview the web app" actions. On desktop it opens the
// phone-frame modal; on phones it navigates straight to the full-screen app.
// `previewLinkProps` spreads onto an <a href="/app/"> so the control is a real
// link (modifier/middle-click still open the app in a new tab) while a plain
// left-click is intercepted to show the preview.
type PreviewCtx = {
  requestPreview: () => void
  previewLinkProps: { href: string; onClick: (e: MouseEvent) => void }
}

const Ctx = createContext<PreviewCtx | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const requestPreview = useCallback(() => {
    // Portrait viewports (phones AND large portrait tablets) are already
    // phone-shaped — open the app full-screen, no frame. Landscape → framed.
    if (isPortrait()) {
      window.location.href = APP_URL
    } else {
      setOpen(true)
    }
  }, [])

  const onClick = useCallback(
    (e: MouseEvent) => {
      // Let the browser handle modified clicks (new tab/window) natively.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      requestPreview()
    },
    [requestPreview],
  )

  return (
    <Ctx.Provider value={{ requestPreview, previewLinkProps: { href: APP_URL, onClick } }}>
      {children}
      <PhonePreview open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  )
}

export function usePreview() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider')
  return ctx
}
