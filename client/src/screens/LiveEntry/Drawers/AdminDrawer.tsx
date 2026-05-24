import type { DerivedGameState, RecordingOptions } from '@/core/types'
import { canRecord } from '@/core/engine'
import { Label } from '@/components/ui/Label'
import { Btn } from '@/components/ui/Btn'
import { Drawer } from './Drawer'
import type { PillSize } from '../Canvas/constants'

interface AdminDrawerProps {
  state: DerivedGameState
  recordingOptions: RecordingOptions
  expanded: boolean
  onToggle: () => void
  onTimeout:    () => void
  onFoul:       () => void
  onPick:       () => void
  onInjurySub:  () => void
  onHalfTime:   () => void
  onEndGame:    () => void
  pillSize:        PillSize
  onCyclePillSize: () => void
}

export const ADMIN_DRAWER_W = 220

export function AdminDrawer({
  state, recordingOptions, expanded, onToggle,
  onTimeout, onFoul, onPick, onInjurySub, onHalfTime, onEndGame,
  pillSize, onCyclePillSize,
}: AdminDrawerProps) {
  const can = (t: Parameters<typeof canRecord>[1]) => canRecord(state, t)

  return (
    <Drawer
      side="left"
      expanded={expanded}
      width={ADMIN_DRAWER_W}
      onToggle={onToggle}
      rail={<AdminRailIcon />}
      footer={<PillSizeButton size={pillSize} expanded={expanded} onClick={onCyclePillSize} />}
    >
      <div
        className="flex-shrink-0 h-7 flex items-center justify-center px-2.5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <Label>STOPPAGES</Label>
      </div>

      <div className="flex-1 p-1.5 flex flex-col gap-1.5 overflow-y-auto">
        <Btn variant="warn"  size="sm" full disabled={!can('injury-sub')} onClick={onInjurySub}>Injury Sub</Btn>
        <Btn variant="ghost" size="sm" full disabled={!can('timeout')}    onClick={onTimeout}>Timeout</Btn>
        {recordingOptions.foul && (
          <Btn variant="ghost" size="sm" full disabled={!can('foul')} onClick={onFoul}>Foul</Btn>
        )}
        {recordingOptions.pick && (
          <Btn variant="ghost" size="sm" full disabled={!can('pick')} onClick={onPick}>Pick</Btn>
        )}

        <div className="h-px my-1" style={{ background: 'var(--color-border)' }} />

        {/*
          Manual half-time / end-game triggers. Useful for time-based formats
          and to override the auto-suggestion flow. canRecord now permits
          half-time/end-game from `in-play` / `awaiting-pull` / `point-over`
          (and end-game also from `half-time`), so the drawer remains
          actionable through the natural post-goal transition.
        */}
        <Btn variant="ghost" size="sm" full disabled={!can('half-time')} onClick={onHalfTime}>Half Time</Btn>
        <Btn variant="ghost" size="sm" full disabled={!can('end-game')}  onClick={onEndGame}>End Game</Btn>
      </div>
    </Drawer>
  )
}

function AdminRailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <circle cx="7" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="7" r="0.9" />
    </svg>
  )
}

// Size cycle: the "A" glyph grows step-by-step. Tapping cycles
// sm → md → lg → sm. When the drawer is expanded, the button shows a
// label too; when collapsed (rail only) it's just the icon.
const SIZE_LABELS: Record<PillSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' }
const SIZE_FONT:   Record<PillSize, number> = { sm: 11,      md: 14,        lg: 17     }

function PillSizeButton({
  size, expanded, onClick,
}: {
  size: PillSize
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center gap-2 cursor-pointer transition-colors"
      style={{
        height: 36,
        background: 'var(--color-surf)',
        borderTop: '1px solid var(--color-border)',
        color: 'var(--color-content)',
        font: 'inherit',
      }}
      title={`Pill size: ${SIZE_LABELS[size]} — tap to cycle`}
    >
      <span style={{ fontWeight: 700, fontSize: SIZE_FONT[size], lineHeight: 1 }}>A</span>
      {expanded && (
        <span style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: 0.4 }}>
          {SIZE_LABELS[size].toUpperCase()}
        </span>
      )}
    </button>
  )
}
