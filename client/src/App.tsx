import { useGameStore } from '@/core/store'
import GameSetup from '@/screens/GameSetup'
import GameSettings from '@/screens/GameSettings'
import LineSelection from '@/screens/LineSelection'
import LiveEntry from '@/screens/LiveEntry'
import PointSummary from '@/screens/PointSummary'
import TeamsManager from '@/screens/TeamsManager'

export default function App() {
  const screen      = useGameStore(s => s.screen)
  const hasSession  = useGameStore(s => s.session !== null)

  // Defensive routing: any session-dependent screen falls back to game-setup
  // if the session is missing. Avoids a black screen if persisted state is
  // inconsistent (e.g. after a storage migration that dropped the session).
  const needsSession  = screen === 'line-selection' || screen === 'live-entry' || screen === 'point-summary'
  const effective     = needsSession && !hasSession ? 'game-setup' : screen

  return (
    <div className="h-full w-full bg-bg text-content font-sans overflow-hidden">
      {effective === 'game-setup'     && <GameSetup />}
      {effective === 'game-settings'  && <GameSettings />}
      {effective === 'teams-manager'  && <TeamsManager />}
      {effective === 'line-selection' && <LineSelection />}
      {effective === 'live-entry'     && <LiveEntry />}
      {effective === 'point-summary'  && <PointSummary />}
    </div>
  )
}
