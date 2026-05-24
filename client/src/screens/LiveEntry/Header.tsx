import type { TeamId, Score, Team } from '@/core/types'
import { pickDisplayNames } from '@/core/teams/shortName'
import { inkOn } from '@/core/contrast'

interface HeaderProps {
  teams: Record<TeamId, Team>
  score: Score
  onBack: () => void
}

// Score-header convention: prefer the long name; fall back to short for
// both teams when either long name would overflow the tight middle column.
// Never one long + one short.
const NAME_FIT_THRESHOLD = 10

// Top strip on Live Entry: back arrow + live score. Transient mode strips
// (pick mode, truncate preview, edit mode, suggestion, notification) are
// stacked separately below this header by the parent screen.
export function Header({ teams, score, onBack }: HeaderProps) {
  const names = pickDisplayNames(teams.A, teams.B, NAME_FIT_THRESHOLD)
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-3 h-16"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <button
        onClick={onBack}
        className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
        title="Back to games"
      >
        ←
      </button>
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
        <span className="flex-1 flex justify-end min-w-0">
          <span
            className="text-sm font-bold truncate px-2 py-0.5 rounded"
            style={{ background: teams.A.color, color: inkOn(teams.A.color) }}
            title={teams.A.name}
          >
            {names.A}
          </span>
        </span>
        <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.A}</strong>
        <span className="text-dim text-base flex-shrink-0">–</span>
        <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.B}</strong>
        <span className="flex-1 flex justify-start min-w-0">
          <span
            className="text-sm font-bold truncate px-2 py-0.5 rounded"
            style={{ background: teams.B.color, color: inkOn(teams.B.color) }}
            title={teams.B.name}
          >
            {names.B}
          </span>
        </span>
      </div>
      <span className="w-4" />
    </div>
  )
}
