import type { TeamId, Score, Team } from '@/core/types'
import { pickDisplayNames } from '@/core/teams/shortName'
import { inkOn } from '@/core/contrast'
import { ScorerInfoButton } from '@/components/ScorerInfoButton'
import { BackIcon } from '@/components/ui/Icons'

interface HeaderProps {
  teams: Record<TeamId, Team>
  score: Score
  /** When true, render Team B's chip + score on the left and Team A's
   *  on the right. The actual A/B identity in state never changes;
   *  this is presentation only. */
  endsSwapped: boolean
  onToggleEnds: () => void
  onBack: () => void
}

// Score-header convention: prefer the long name; fall back to short for
// both teams when either long name would overflow the tight middle column.
// Never one long + one short.
const NAME_FIT_THRESHOLD = 10

// Top strip on Live Entry: back arrow + live score. The "–" between
// the two score numbers doubles as the swap-ends control — tap it to
// flip which team renders on which side. Transient mode strips (pick
// mode, truncate preview, edit mode, suggestion, notification) are
// stacked separately below this header by the parent screen.
export function Header({ teams, score, endsSwapped, onToggleEnds, onBack }: HeaderProps) {
  const names = pickDisplayNames(teams.A, teams.B, NAME_FIT_THRESHOLD)
  const left:  TeamId = endsSwapped ? 'B' : 'A'
  const right: TeamId = endsSwapped ? 'A' : 'B'
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-3 h-16"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <button
        onClick={onBack}
        className="text-muted hover:text-content transition-colors cursor-pointer flex items-center leading-none"
        title="Back to games"
      >
        <BackIcon size={20} />
      </button>
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
        <span className="flex-1 flex justify-end min-w-0">
          <span
            className="text-sm font-bold truncate px-2 py-0.5 rounded"
            style={{ background: teams[left].color, color: inkOn(teams[left].color) }}
            title={teams[left].name}
          >
            {names[left]}
          </span>
        </span>
        <strong key={`L${score[left]}`} className="text-[34px] font-display font-bold tabular-nums leading-none text-content flex-shrink-0 ml-2 inline-block" style={{ animation: 'scorePulse 420ms ease-out' }}>{score[left]}</strong>
        <button
          onClick={onToggleEnds}
          aria-label="Swap ends"
          title="Swap ends"
          className="flex-shrink-0 flex items-center justify-center cursor-pointer text-muted hover:text-content transition-colors"
          style={{ background: 'transparent', padding: 1 }}
        >
          <SwapEndsIcon size={14} />
        </button>
        <strong key={`R${score[right]}`} className="text-[34px] font-display font-bold tabular-nums leading-none text-content flex-shrink-0 mr-2 inline-block" style={{ animation: 'scorePulse 420ms ease-out' }}>{score[right]}</strong>
        <span className="flex-1 flex justify-start min-w-0">
          <span
            className="text-sm font-bold truncate px-2 py-0.5 rounded"
            style={{ background: teams[right].color, color: inkOn(teams[right].color) }}
            title={teams[right].name}
          >
            {names[right]}
          </span>
        </span>
      </div>
      <ScorerInfoButton compact />
    </div>
  )
}

function SwapEndsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 7h12" />
      <path d="m15 3 4 4-4 4" />
      <path d="M17 17H5" />
      <path d="m9 21-4-4 4-4" />
    </svg>
  )
}
