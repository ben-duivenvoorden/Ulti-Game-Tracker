import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  teamColor: string
  /** Cap how many recent passes are shown — fades older ones. */
  maxArrows?: number
}

// Thin vertical lane sitting between the PlayerColumn and EventColumn,
// showing recent passes as CSS arrows from sender's row to receiver's
// row. No SVG.
//
// Each player row in the PlayerColumn has the same height; the lane is
// divided into matching rows. For each pass we render an arrowhead at
// the receiver's row centre and a thin connector line spanning from
// sender's row centre down/up to the arrowhead.
export function PassLane({ visLog, players, activeTeam, teamColor, maxArrows = 2 }: PassLaneProps) {
  const arrows = derivePassArrows(visLog, activeTeam, players, maxArrows)
  const N = players.length

  return (
    <div className="relative h-full w-8" aria-hidden>
      {/* Faint backbone so the lane always reads as a deliberate area. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1.5 bottom-1.5 w-px"
        style={{ background: 'var(--color-border)' }}
      />

      {arrows.map((a, i) => {
        const isMostRecent = i === arrows.length - 1
        const opacity = isMostRecent ? 1 : 0.4
        const width   = isMostRecent ? 2 : 1.5

        // Row centres in the lane, mirroring the PlayerColumn's flex-1
        // rows: each row gets 1/N of the total height. Adding the top/
        // bottom padding (1.5 + 1.5) matches the column's `p-1.5`.
        const from = rowCenterPct(a.fromIdx, N)
        const to   = rowCenterPct(a.toIdx,   N)
        const top    = Math.min(from, to)
        const bottom = Math.max(from, to)

        return (
          <div key={i} className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              top:    `calc(6px + ${top}% - 6px)`,
              height: `calc(${bottom - top}% + 12px)`,
              width:  width,
              background: teamColor,
              opacity,
              borderRadius: 1,
            }}
          />
        )
      })}

      {arrows.map((a, i) => {
        const isMostRecent = i === arrows.length - 1
        const opacity = isMostRecent ? 1 : 0.4
        const to       = rowCenterPct(a.toIdx, N)
        const downward = a.toIdx > a.fromIdx
        // CSS triangle arrowhead pointing at the receiver's row centre.
        return (
          <div key={`h-${i}`}
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              top:        `calc(6px + ${to}% - 5px)`,
              width:      0,
              height:     0,
              borderLeft:  '6px solid transparent',
              borderRight: '6px solid transparent',
              [downward ? 'borderTop' : 'borderBottom']: `8px solid ${teamColor}`,
              opacity,
            }}
          />
        )
      })}
    </div>
  )
}

interface PassArrow { fromIdx: number; toIdx: number }

// Walk the visLog backwards collecting consecutive `possession` events
// for the active team. Any other event (turnover, block, intercept,
// pull/brick, opposing possession, or point-start) breaks the chain —
// so the lane clears when possession flips. Returns at most `maxArrows`
// most-recent arrows (newest last).
function derivePassArrows(
  visLog: VisLogEntry[],
  teamId: TeamId,
  players: Player[],
  maxArrows: number,
): PassArrow[] {
  type Possession = Extract<VisLogEntry, { type: 'possession' }>
  const chain: Possession[] = []
  for (let i = visLog.length - 1; i >= 0; i--) {
    const e = visLog[i]
    if (e.type === 'possession' && e.teamId === teamId) {
      chain.push(e)
    } else {
      break
    }
  }
  chain.reverse()

  const arrows: PassArrow[] = []
  for (let i = 1; i < chain.length; i++) {
    const fromIdx = players.findIndex(p => p.id === chain[i - 1].playerId)
    const toIdx   = players.findIndex(p => p.id === chain[i].playerId)
    if (fromIdx >= 0 && toIdx >= 0) arrows.push({ fromIdx, toIdx })
  }
  return arrows.slice(-maxArrows)
}

// Centre of row `idx` as a percentage of the lane's height (the gap
// rows are `gap-1.5` = 6px in the PlayerColumn; we approximate by
// treating each row as 1/N of the available height).
function rowCenterPct(idx: number, n: number): number {
  if (n <= 0) return 50
  return ((idx + 0.5) / n) * 100
}
