import type { ReactNode } from 'react'
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
  onUnknownTurnover: () => void

  // Awaiting-pull
  onPull:      () => void
  onPullBonus: () => void
  onBrick:     () => void

  onMore: () => void

  /** Voice PTT docked next to the More button (bottom corner of the column) —
   *  provided by LiveEntry only when a voice engine is present. */
  voiceSlot?: ReactNode
}

interface EventBtnDef {
  label:    string
  fg:       string  // text colour (also the button background)
  ink:      string  // text colour used on the solid fill — '#fff' or '#111'
  enabled:  boolean
  onTap:    () => void
  hidden?:  boolean
  /** Dull variant — grey, dotted, recessive. Used for the de-emphasised
   *  data-quality affordance (Unknown Turnover): readable, but not as
   *  enticing to press as the solid category buttons. */
  dull?:    boolean
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
      // A turnover we couldn't fully attribute. No holder required. Styled
      // grey + dull + dotted (not the eye-catching category colours) so it
      // reads as a fallback, not a primary action. (Unknown Player now lives
      // in the player column — it's a player-attribution choice, not an event.)
      label: 'Unknown turnover',
      fg:    'var(--color-dull)',
      ink:   'var(--color-content)',
      dull:  true,
      enabled: armed && inPlay && canRecord(state, 'turnover-unknown'),
      onTap: props.onUnknownTurnover,
    },
    {
      label: 'Goal',
      fg:    'var(--color-success)',
      ink:   '#fff',
      // A goal needs a live disc. `canRecord` blocks it off every dead-disc
      // pickup — pull, turnover, OR block — until the team completes ≥1 pass.
      // Only an intercept (a live catch) can score immediately, as a Callahan.
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

  // In-play: turnover-family buttons + Unknown turnover, followed by Goal at
  // the bottom. Awaiting-pull: Pull / Bonus / Brick. Plus filler rows + the
  // More button at the bottom, separate from the group.
  const actionButtons = inPlay
    ? inPlayButtons.filter(b => !b.hidden)
    : awaitingPullButtons.filter(b => !b.hidden)
  // Filler rows between the actions and More so the event column has exactly
  // `playerCount` equal flex rows — structurally identical to the player
  // column (same child + gap count). This keeps every action tile at
  // player-tile height AND keeps the SankeyBridge wrap (which sizes tiles from
  // playerCount, i.e. playerCount-1 gaps) flush around the action buttons. A
  // single collapsed `flex` spacer under-counts gaps, so the wrap falls short
  // of the last action button — most visible around the 3 pull options on
  // awaiting-pull, where the filler region is largest.
  const fillerRows = Math.max(0, playerCount - actionButtons.length - 1)

  return (
    <div className="flex flex-col gap-4 p-3 h-full overflow-y-auto">
      {actionButtons.map((b, i) => <EventBtn key={`a${i}`} {...b} />)}
      {Array.from({ length: fillerRows }).map((_, i) => (
        // border-2 border-transparent gives the filler the SAME box as the action
        // tiles. Without it the borderless filler renders a few px short and flex
        // spreads that slack across the buttons, drifting them down and breaking
        // row alignment with the player column (visible as Goal vs its player row).
        <div key={`f${i}`} className="flex-1 min-h-0 border-2 border-transparent" aria-hidden />
      ))}
      {props.voiceSlot ? (
        // Voice dock: the PTT takes room from the More row, sitting in the
        // column's bottom corner — the same corner language as LineSelection.
        <div className="flex-1 min-h-0 flex gap-3 items-stretch">
          <EventBtn
            label="More"
            fg="var(--color-muted)"
            ink="var(--color-content)"
            enabled
            onTap={props.onMore}
          />
          <div className="flex items-center justify-center flex-shrink-0">
            {props.voiceSlot}
          </div>
        </div>
      ) : (
        <EventBtn
          label="More"
          fg="var(--color-muted)"
          ink="var(--color-content)"
          enabled
          onTap={props.onMore}
        />
      )}
    </div>
  )
}

function EventBtn({ label, fg, ink, enabled, dull, onTap }: EventBtnDef) {
  const [first, rest] = splitLabel(label)
  // Two distinct de-emphasised states, deliberately pulled apart:
  //  - DISABLED (not available now): darker-than-surface flat fill, dim text,
  //    faint solid border, ~40% opacity — clearly inert, recedes.
  //  - DISCOURAGED (`dull`, available but a fallback — Unknown turnover): the
  //    surf-2 tile with a dull dotted outline, full opacity, and a hover-lift,
  //    so it reads as a real (if secondary) control you *can* press.
  const background  = !enabled ? 'var(--color-surf)'   : dull ? 'var(--color-surf-2)' : fg
  const color       = !enabled ? 'var(--color-dim)'    : dull ? 'var(--color-dull)'   : ink
  const borderColor = !enabled ? 'var(--color-border)' : dull ? 'var(--color-dull)'   : fg
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!enabled}
      className={`flex-1 min-h-0 rounded-xl border-2 cursor-pointer transition select-none disabled:cursor-default flex flex-col items-center justify-center px-2 text-center ${dull ? 'hover:brightness-125' : ''}`}
      style={{
        background,
        color,
        borderColor,
        borderStyle:   dull ? 'dotted' : 'solid',
        opacity:       !enabled ? 0.4 : 1,
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
