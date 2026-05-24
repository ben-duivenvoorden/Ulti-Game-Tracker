import type { DerivedGameState, RecordingOptions } from '@/core/types'
import { canRecord } from '@/core/engine'

interface EventColumnProps {
  state: DerivedGameState
  recordingOptions: RecordingOptions
  firstPossession: boolean
  pullerSelected: boolean

  // In-play
  onGoal:          () => void
  onThrowaway:     () => void
  onReceiverError: () => void
  onBlock:         () => void
  onIntercept:     () => void
  onStall:         () => void

  // Awaiting-pull
  onPull:      () => void
  onPullBonus: () => void
  onBrick:     () => void

  onMore: () => void
}

// Solid colour + inverted text for each event button. The colours
// mirror format.ts / index.css's --color-<type> tokens so the button
// for a Goal looks the same colour as the Goal entry in the log.
//
// Each event is its own button (no submenus). The set varies with
// phase; the MORE button is constant at the bottom.

interface EventBtnDef {
  label:    string
  fg:       string  // text colour (also the button background)
  ink:      string  // text colour used on the solid fill — '#fff' or '#111'
  enabled:  boolean
  onTap:    () => void
  hidden?:  boolean
}

export function EventColumn(props: EventColumnProps) {
  const { state, recordingOptions, firstPossession, pullerSelected } = props
  const phase = state.gamePhase
  const hasHolder = state.discHolder !== null
  const inPlay = phase === 'in-play'
  const awaitingPull = phase === 'awaiting-pull'

  const inPlayButtons: EventBtnDef[] = [
    {
      label: 'Goal',
      fg:    'var(--color-success)',
      ink:   '#fff',
      enabled: inPlay && hasHolder && !firstPossession && canRecord(state, 'goal'),
      onTap: props.onGoal,
    },
    {
      label: 'Throw Away',
      fg:    'var(--color-danger)',
      ink:   '#fff',
      enabled: inPlay && hasHolder && canRecord(state, 'turnover-throw-away'),
      onTap: props.onThrowaway,
    },
    {
      label: 'Receiver Error',
      fg:    'var(--color-warn)',
      ink:   '#111',
      enabled: inPlay && hasHolder && !firstPossession && canRecord(state, 'turnover-receiver-error'),
      onTap: props.onReceiverError,
    },
    {
      label: 'Blocked by …',
      fg:    'var(--color-block)',
      ink:   '#fff',
      enabled: inPlay && canRecord(state, 'block'),
      onTap: props.onBlock,
    },
    {
      label: 'Intercepted by …',
      fg:    'var(--color-intercept)',
      ink:   '#111',
      enabled: inPlay && canRecord(state, 'intercept'),
      onTap: props.onIntercept,
    },
    {
      label: 'Stall',
      fg:    'var(--color-stall)',
      ink:   '#fff',
      hidden: !recordingOptions.stall,
      enabled: inPlay && hasHolder && canRecord(state, 'turnover-stall'),
      onTap: props.onStall,
    },
  ]

  const awaitingPullButtons: EventBtnDef[] = [
    {
      label: 'Pull',
      fg:    'var(--color-team-a)',
      ink:   '#fff',
      enabled: awaitingPull && pullerSelected && canRecord(state, 'pull'),
      onTap: props.onPull,
    },
    {
      label: 'Pull Distance Bonus',
      fg:    'var(--color-pull-bonus)',
      ink:   '#fff',
      hidden: !recordingOptions.pullBonus,
      enabled: awaitingPull && pullerSelected && canRecord(state, 'pull-bonus'),
      onTap: props.onPullBonus,
    },
    {
      label: 'Brick',
      fg:    'var(--color-brick)',
      ink:   '#fff',
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
      <EventBtn
        label="More"
        fg="var(--color-muted)"
        ink="var(--color-content)"
        enabled
        onTap={props.onMore}
      />
    </div>
  )
}

function EventBtn({ label, fg, ink, enabled, onTap }: EventBtnDef) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!enabled}
      className="flex-1 min-h-0 rounded-lg border-2 cursor-pointer transition-opacity select-none disabled:opacity-25 disabled:cursor-default flex items-center justify-center px-2 text-center"
      style={{
        background:    fg,
        color:         ink,
        borderColor:   fg,
        fontSize:      'clamp(14px, 4.5vw, 19px)',
        fontWeight:    700,
        letterSpacing: 0.4,
        lineHeight:    1.15,
      }}
    >
      {label}
    </button>
  )
}
