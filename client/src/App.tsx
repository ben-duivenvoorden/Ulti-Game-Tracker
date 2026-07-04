import { useGameStore } from '@/core/store'
import GameSetup from '@/screens/GameSetup'
import GameSettings from '@/screens/GameSettings'
import CompetitionSettings from '@/screens/CompetitionSettings'
import LineSelection from '@/screens/LineSelection'
import LiveEntry from '@/screens/LiveEntry'
import PointSummary from '@/screens/PointSummary'
import TeamsManager from '@/screens/TeamsManager'

export default function App() {
  const screen      = useGameStore(s => s.screen)
  const hasSession  = useGameStore(s => s.session !== null)
  const editingComp = useGameStore(s => s.editingCompetitionId !== null)

  // Defensive routing: any state-dependent screen falls back to game-setup
  // if its state is missing. Avoids a black screen if persisted state is
  // inconsistent (e.g. after a storage migration that dropped the session).
  const needsSession  = screen === 'line-selection' || screen === 'live-entry' || screen === 'point-summary'
  const effective     = (needsSession && !hasSession) || (screen === 'competition-settings' && !editingComp)
    ? 'game-setup'
    : screen

  return (
    <div className="h-full w-full bg-bg text-content font-sans overflow-hidden">
      {effective === 'game-setup'           && <GameSetup />}
      {effective === 'game-settings'        && <GameSettings />}
      {effective === 'competition-settings' && <CompetitionSettings />}
      {effective === 'teams-manager'        && <TeamsManager />}
      {effective === 'line-selection'       && <LineSelection />}
      {effective === 'live-entry'           && <LiveEntry />}
      {effective === 'point-summary'        && <PointSummary />}
    </div>
  )
}
