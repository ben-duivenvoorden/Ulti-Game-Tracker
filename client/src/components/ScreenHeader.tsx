import type { ReactNode } from 'react'
import { Label } from '@/components/ui/Label'
import { BackIcon } from '@/components/ui/Icons'

// ─── Screen header ────────────────────────────────────────────────────────────
// The shared h-16 top strip used by every simple screen (GameSetup,
// GameSettings, TeamsManager, NewGame). Two content modes:
//   - kicker/title → left-aligned two-line block (mono kicker over bold title)
//   - center       → content centred between the back arrow and right action
// The score headers (LiveEntry, LineSelection) stay bespoke — their middle
// column has its own layout rules.

export function ScreenHeader({ onBack, backTitle, kicker, title, center, right }: {
  onBack?:    () => void
  backTitle?: string
  /** Small mono label above the title (left-aligned mode). */
  kicker?:    string
  /** Bold title line (left-aligned mode). Ignored when `center` is set. */
  title?:     ReactNode
  /** Centred middle content — replaces the kicker/title block. */
  center?:    ReactNode
  right?:     ReactNode
}) {
  return (
    <div
      className={`flex-shrink-0 h-16 border-b border-border flex items-center justify-between gap-3 ${onBack ? 'px-3' : 'px-4'}`}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="text-muted hover:text-content transition-colors cursor-pointer flex items-center leading-none flex-shrink-0"
          title={backTitle}
        >
          <BackIcon size={20} />
        </button>
      )}
      {center ? (
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">{center}</div>
      ) : (
        <div className="flex-1 min-w-0">
          {kicker && <Label block className="mb-0.5">{kicker}</Label>}
          {title && <div className="text-base font-bold leading-tight">{title}</div>}
        </div>
      )}
      {right && <div className="flex items-center gap-1 flex-shrink-0">{right}</div>}
    </div>
  )
}
