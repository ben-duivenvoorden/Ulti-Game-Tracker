import type { DerivedGameState, RecordingOptions } from '@/core/types'
import { canRecord } from '@/core/engine'

interface EventColumnProps {
  state: DerivedGameState
  recordingOptions: RecordingOptions
  firstPossession: boolean
  pullerSelected: boolean
  /** Active team's brand colour — used as a subtle wash behind the buttons. */
  teamColor: string
  /** Number of player tiles in the PlayerColumn — so action tiles can be
   *  sized to match them by padding empty slots between the actions and
   *  the More button. */
  playerCount: number
  /** True while a pick-mode is active (e.g. picking the blocker /
   *  interceptor). All action buttons are disabled until the pick is
   *  resolved or cancelled — only the player tap below is meaningful. */
  isPicking: boolean

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

interface EventBtnDef {
  label:    string
  fg:       string  // text colour (also the button background)
  ink:      string  // text colour used on the solid fill — '#fff' or '#111'
  enabled:  boolean
  onTap:    () => void
  hidden?:  boolean
}

// In-play layout: turnover cluster at the top, ordered receiver-first
// because Receiver Error reads as the natural follow-up to a tap on a
// player who failed to catch. Then Throw away / Block / Intercept,
// then Stall (hidden by default), then Goal at the very bottom — point-
// ending, parked furthest from the player column to reduce accidental
// taps mid-point.
//
// The four+1 turnover-family buttons sit under a single vertical
// "TURNOVERS" subheading running along the side of the section; Goal
// sits under a same-height blank subheading for visual symmetry.
export function EventColumn(props: EventColumnProps) {
  const { state, recordingOptions, firstPossession, pullerSelected, playerCount, isPicking } = props
  const phase = state.gamePhase
  const hasHolder = state.discHolder !== null
  const inPlay = phase === 'in-play'
  const awaitingPull = phase === 'awaiting-pull'
  // While picking a defender (block / intercept), no action button is a
  // valid next step — only the player tap below resolves the pending
  // action. AND'd into every button's enabled flag so the in-play
  // button set still renders (disabled), instead of falling through to
  // the awaiting-pull set.
  const armed = !isPicking

  const inPlayButtons: EventBtnDef[] = [
    {
      label: 'Receiver Error',
      fg:    'var(--color-warn)',
      ink:   '#111',
      enabled: armed && inPlay && hasHolder && !firstPossession && canRecord(state, 'turnover-receiver-error'),
      onTap: props.onReceiverError,
    },
    {
      label: 'Throw away',
      fg:    'var(--color-danger)',
      ink:   '#fff',
      enabled: armed && inPlay && hasHolder && canRecord(state, 'turnover-throw-away'),
      onTap: props.onThrowaway,
    },
    {
      label: 'Blocked by defence…',
      fg:    'var(--color-block)',
      ink:   '#fff',
      // Requires a holder on the offensive team — there's no thrown disc
      // to block until someone has picked it up after the previous
      // turnover / pull.
      enabled: armed && inPlay && hasHolder && canRecord(state, 'block'),
      onTap: props.onBlock,
    },
    {
      label: 'Intercepted by defence…',
      fg:    'var(--color-intercept)',
      ink:   '#111',
      // Same as Block — needs an offensive holder before an intercept
      // makes sense.
      enabled: armed && inPlay && hasHolder && canRecord(state, 'intercept'),
      onTap: props.onIntercept,
    },
    {
      label: 'Stall',
      fg:    'var(--color-stall)',
      ink:   '#fff',
      hidden: !recordingOptions.stall,
      enabled: armed && inPlay && hasHolder && canRecord(state, 'turnover-stall'),
      onTap: props.onStall,
    },
    {
      label: 'Goal',
      fg:    'var(--color-success)',
      ink:   '#fff',
      // Any possession — including a fresh block / intercept — can be
      // followed by a goal. Post-log analysis flags the
      // block/intercept → goal pair as a Callahan.
      enabled: armed && inPlay && hasHolder && canRecord(state, 'goal'),
      onTap: props.onGoal,
    },
  ]

  const awaitingPullButtons: EventBtnDef[] = [
    {
      label: 'Pull',
      fg:    'var(--color-team-a)',
      ink:   '#fff',
      enabled: armed && awaitingPull && pullerSelected && canRecord(state, 'pull'),
      onTap: props.onPull,
    },
    {
      label: 'Pull Distance Bonus',
      fg:    'var(--color-pull-bonus)',
      ink:   '#fff',
      hidden: !recordingOptions.pullBonus,
      enabled: armed && awaitingPull && pullerSelected && canRecord(state, 'pull-bonus'),
      onTap: props.onPullBonus,
    },
    {
      label: 'Brick',
      fg:    'var(--color-brick)',
      ink:   '#fff',
      hidden: !recordingOptions.brick,
      enabled: armed && awaitingPull && pullerSelected && canRecord(state, 'brick'),
      onTap: props.onBrick,
    },
  ]

  // In-play: 4 (or 5 with Stall) turnover-family buttons followed by
  // Goal stacked adjacent. Awaiting-pull: Pull / Bonus / Brick. Plus a
  // gap + the More button at the bottom, separate from the action group.
  const actionButtons = inPlay
    ? [...inPlayButtons.slice(0, 5).filter(b => !b.hidden), ...inPlayButtons.slice(5).filter(b => !b.hidden)]
    : awaitingPullButtons.filter(b => !b.hidden)
  // Pad to match playerCount so each action tile renders at player-tile
  // height. The spacer between actions and More carries the remainder.
  const gapFlex = Math.max(0, playerCount - actionButtons.length - 1)

  return (
    <div className="flex flex-col gap-4 p-3 h-full overflow-y-auto">
      {actionButtons.map((b, i) => <EventBtn key={`a${i}`} {...b} />)}
      {gapFlex > 0 && (
        <div className="min-h-0" style={{ flex: gapFlex }} aria-hidden />
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
  const [first, rest] = splitLabel(label)
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!enabled}
      className="flex-1 min-h-0 rounded-xl border-2 cursor-pointer transition-colors select-none disabled:cursor-default flex flex-col items-center justify-center px-2 text-center"
      style={{
        // Disabled state drops the category colour entirely for a flat
        // grey that reads as "not available" against the dark background
        // — matches the ineligible-pill treatment in PlayerColumn.
        background:    enabled ? fg                       : 'var(--color-surf-2)',
        color:         enabled ? ink                      : 'var(--color-dim)',
        borderColor:   enabled ? fg                       : 'var(--color-border)',
        fontWeight:    700,
        letterSpacing: 0.2,
        lineHeight:    1.15,
      }}
    >
      <span
        className="block w-full text-center truncate"
        style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
      >
        {first}
      </span>
      {rest && (
        <span
          className="block w-full text-center truncate"
          style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
        >
          {rest}
        </span>
      )}
    </button>
  )
}

// Split a label on the first whitespace: "Throw away" → ["Throw", "away"],
// "Blocked by defence…" → ["Blocked", "by defence…"], "Goal" →
// ["Goal", null]. Both lines render at the same font size; single-word
// labels just sit vertically centred on the button.
function splitLabel(label: string): [string, string | null] {
  const i = label.indexOf(' ')
  if (i < 0) return [label, null]
  return [label.slice(0, i), label.slice(i + 1)]
}
