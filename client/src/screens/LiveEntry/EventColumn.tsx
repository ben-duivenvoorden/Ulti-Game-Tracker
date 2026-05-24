import type { DerivedGameState, RecordingOptions } from '@/core/types'
import { canRecord } from '@/core/engine'

interface EventColumnProps {
  state: DerivedGameState
  recordingOptions: RecordingOptions
  /** True until the active team's current possession run has at least one
   *  pass recorded — Goal / Receiver Error stay disabled until then. */
  firstPossession: boolean
  /** A puller has been selected in the player column (awaiting-pull only). */
  pullerSelected: boolean

  // ── In-play actions ────────────────────────────────────────────────────
  onGoal:          () => void
  onThrowaway:     () => void
  onReceiverError: () => void
  onBlock:         () => void
  onIntercept:     () => void
  onStall:         () => void

  // ── Awaiting-pull actions ──────────────────────────────────────────────
  onPull:      () => void
  onPullBonus: () => void
  onBrick:     () => void

  /** Opens the bottom sheet's More tab (stoppages, manual half-time, etc). */
  onMore: () => void
}

type Tone = 'success' | 'warn' | 'block' | 'primary' | 'neutral' | 'danger' | 'stall'

interface EventBtnDef {
  label:    string
  tone:     Tone
  enabled:  boolean
  onTap:    () => void
  /** When true, the row is rendered but visibly empty (keeps the column
   *  count stable across configuration changes). */
  hidden?:  boolean
}

// Flat vertical list of event buttons. The set depends on phase:
//  - in-play: Goal / Throwaway / Receiver Error / Block / Intercept (+ Stall when enabled)
//  - awaiting-pull: Pull / Pull Bonus (opt) / Brick (opt)
//
// Plus a constant MORE button at the bottom that opens the More sheet.
// Each event is its own button — flat structure, no submenus.
export function EventColumn(props: EventColumnProps) {
  const { state, recordingOptions, firstPossession, pullerSelected } = props
  const phase = state.gamePhase
  const hasHolder = state.discHolder !== null
  const inPlay = phase === 'in-play'
  const awaitingPull = phase === 'awaiting-pull'

  const inPlayButtons: EventBtnDef[] = [
    {
      label: 'Goal',
      tone:  'success',
      enabled: inPlay && hasHolder && !firstPossession && canRecord(state, 'goal'),
      onTap: props.onGoal,
    },
    {
      label: 'Throwaway',
      tone:  'warn',
      enabled: inPlay && hasHolder && canRecord(state, 'turnover-throw-away'),
      onTap: props.onThrowaway,
    },
    {
      label: 'Receiver Error',
      tone:  'danger',
      enabled: inPlay && hasHolder && !firstPossession && canRecord(state, 'turnover-receiver-error'),
      onTap: props.onReceiverError,
    },
    {
      label: 'Block',
      tone:  'block',
      enabled: inPlay && canRecord(state, 'block'),
      onTap: props.onBlock,
    },
    {
      label: 'Intercept',
      tone:  'block',
      enabled: inPlay && canRecord(state, 'intercept'),
      onTap: props.onIntercept,
    },
    {
      label: 'Stall',
      tone:  'stall',
      hidden: !recordingOptions.stall,
      enabled: inPlay && hasHolder && canRecord(state, 'turnover-stall'),
      onTap: props.onStall,
    },
  ]

  const awaitingPullButtons: EventBtnDef[] = [
    {
      label: 'Pull',
      tone:  'primary',
      enabled: awaitingPull && pullerSelected && canRecord(state, 'pull'),
      onTap: props.onPull,
    },
    {
      label: 'Bonus',
      tone:  'primary',
      hidden: !recordingOptions.pullBonus,
      enabled: awaitingPull && pullerSelected && canRecord(state, 'pull-bonus'),
      onTap: props.onPullBonus,
    },
    {
      label: 'Brick',
      tone:  'warn',
      hidden: !recordingOptions.brick,
      enabled: awaitingPull && pullerSelected && canRecord(state, 'brick'),
      onTap: props.onBrick,
    },
  ]

  const buttons = inPlay ? inPlayButtons : awaitingPull ? awaitingPullButtons : []

  return (
    <div className="flex flex-col gap-1.5 p-1.5 h-full overflow-y-auto">
      {buttons.map((b, i) =>
        b.hidden
          ? <div key={i} className="flex-1" />
          : <EventBtn key={i} {...b} />,
      )}
      <EventBtn label="More" tone="neutral" enabled onTap={props.onMore} />
    </div>
  )
}

function EventBtn({ label, tone, enabled, onTap }: EventBtnDef) {
  const { bg, fg, border } = toneColours(tone)
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!enabled}
      className="flex-1 min-h-0 rounded-lg border cursor-pointer transition-opacity select-none disabled:opacity-25 disabled:cursor-default"
      style={{
        background:    bg,
        color:         fg,
        borderColor:   border,
        borderWidth:   1.5,
        fontSize:      18,
        fontWeight:    700,
        letterSpacing: 0.4,
      }}
    >
      {label}
    </button>
  )
}

function toneColours(tone: Tone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'success': return { bg: 'var(--color-success-bg)', fg: 'var(--color-success)', border: 'var(--color-success)' }
    case 'warn':    return { bg: 'var(--color-warn-bg)',    fg: 'var(--color-warn)',    border: 'var(--color-warn)'    }
    case 'danger':  return { bg: 'var(--color-warn-bg)',    fg: 'var(--color-warn)',    border: 'var(--color-warn)'    }
    case 'block':   return { bg: 'var(--color-block-bg)',   fg: 'var(--color-block)',   border: 'var(--color-block)'   }
    case 'stall':   return { bg: 'var(--color-warn-bg)',    fg: 'var(--color-warn)',    border: 'var(--color-warn)'    }
    case 'primary': return { bg: 'var(--color-surf-2)',     fg: 'var(--color-content)', border: 'var(--color-border-2)' }
    case 'neutral': return { bg: 'var(--color-surf-2)',     fg: 'var(--color-muted)',   border: 'var(--color-border)'   }
  }
}
