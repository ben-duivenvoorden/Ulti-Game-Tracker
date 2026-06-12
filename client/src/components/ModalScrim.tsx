import type { CSSProperties, ReactNode } from 'react'

// ─── Modal scaffold ───────────────────────────────────────────────────────────
// Shared scrim + panel shell for every in-app modal (ConfirmSheet, PromptSheet,
// the inline dialogs, the backfill picker). Tap the backdrop to dismiss; the
// panel swallows the tap. Render inside a `relative` container.
//
// `variant: 'dialog'` is the standard centred card (rounded, surf background,
// max-w-sm) — pass the gap via `panelClassName`. `variant: 'bare'` renders
// only the positioned panel wrapper so sheet-style content (e.g. the
// bottom-anchored picker) brings its own chrome.

export function ModalScrim({
  onDismiss, align = 'center', variant = 'dialog', z = 50, panelClassName = '', panelStyle, children,
}: {
  onDismiss:       () => void
  align?:          'center' | 'bottom'
  variant?:        'dialog' | 'bare'
  z?:              number
  panelClassName?: string
  panelStyle?:     CSSProperties
  children:        ReactNode
}) {
  const dialog = variant === 'dialog'
  return (
    <div
      className={`absolute inset-0 flex ${align === 'bottom' ? 'items-end' : 'items-center justify-center p-4'}`}
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: z }}
      onClick={onDismiss}
    >
      <div
        className={`${dialog ? 'rounded-xl p-5 w-full max-w-sm flex flex-col' : ''} ${panelClassName}`}
        style={{
          ...(dialog ? { background: 'var(--color-surf)', border: '1px solid var(--color-border-2)' } : {}),
          ...panelStyle,
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
