import type { TeamId, Score, Team } from '@/core/types'
import { pickDisplayNames } from '@/core/teams/shortName'

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
      className="flex-shrink-0 flex items-center justify-between px-3 h-12"
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
        <span
          className="text-sm font-bold truncate text-right flex-1"
          style={{ color: teams.A.color }}
          title={teams.A.name}
        >
          {names.A}
        </span>
        <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.A}</strong>
        <span className="text-dim text-base flex-shrink-0">–</span>
        <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.B}</strong>
        <span
          className="text-sm font-bold truncate text-left flex-1"
          style={{ color: teams.B.color }}
          title={teams.B.name}
        >
          {names.B}
        </span>
      </div>
      <span className="w-4" />
    </div>
  )
}
