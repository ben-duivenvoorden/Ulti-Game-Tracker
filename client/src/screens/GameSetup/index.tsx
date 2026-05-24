import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { IconBtn, SettingsIcon, TeamsIcon } from '@/components/ui/Icons'
import { useGameStore } from '@/core/store'
import { useScheduledGames, useSession, useTeamsState } from '@/core/selectors'
import { deriveGameState, deriveGameStatus } from '@/core/engine'
import { resolveGameConfig } from '@/core/games/engine'
import type { TeamId } from '@/core/types'
import NewGameForm from '@/screens/NewGame'

// Sentinel that pushes the NewGame form full-screen.
const NEW_GAME_SENTINEL = -1

export default function GameSetup() {
  const selectGame       = useGameStore(s => s.selectGame)
  const resumeGame       = useGameStore(s => s.resumeGame)
  const openGameSettings = useGameStore(s => s.openGameSettings)
  const openTeamsManager = useGameStore(s => s.openTeamsManager)
  const session          = useSession()
  const games            = useScheduledGames()
  const teamsState       = useTeamsState()

  // When set, expand the matching card inline to show pulling-team picker.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pullingTeam, setPullingTeam] = useState<TeamId | null>(null)

  const sessionGameId = session?.gameConfig.id ?? null

  // Full-screen NewGame form pushes over the list.
  if (expandedId === NEW_GAME_SENTINEL) {
    return (
      <NewGameForm
        onCreated={(newId) => { setExpandedId(newId); setPullingTeam(null) }}
        onCancel={() => setExpandedId(null)}
      />
    )
  }

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Header — same h-16 (64 px) height across every screen. Two-line
          title on the left, two large action icons on the right. */}
      <div className="flex-shrink-0 h-16 border-b border-border flex items-center justify-between px-4 gap-3">
        <div>
          <Label block className="mb-0.5">GAME SETUP</Label>
          <div className="text-base font-bold leading-tight">Games</div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={openTeamsManager} title="Manage teams">
            <TeamsIcon />
          </IconBtn>
          <IconBtn onClick={openGameSettings} title="Recording settings">
            <SettingsIcon />
          </IconBtn>
        </div>
      </div>

      {/* Game list */}
      <div className="flex-1 overflow-y-auto">
        {games.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-5xl mb-4 opacity-30">🥏</div>
            <Label className="mb-3">No games scheduled yet</Label>
            <Btn variant="primary" size="md" onClick={() => { setExpandedId(NEW_GAME_SENTINEL); setPullingTeam(null) }}>
              + New Game
            </Btn>
          </div>
        ) : games.map(g => {
          const resolved = resolveGameConfig(g, teamsState)
          const liveSession = (session && sessionGameId === g.id) ? session : null
          const status = deriveGameStatus(liveSession)
          const liveScore = liveSession ? deriveGameState(liveSession).score : null
          const isLive    = status === 'in-progress'
          const isDone    = status === 'complete'
          const chipColor = isLive ? 'var(--color-success)' : isDone ? 'var(--color-dim)' : 'var(--color-muted)'
          const chipText  = isLive ? 'LIVE' : isDone ? 'DONE' : 'SCHED'
          const expanded  = expandedId === g.id

          return (
            <div
              key={g.id}
              className="border-b border-border"
              style={{ background: expanded ? 'var(--color-surf-2)' : 'transparent' }}
            >
              <button
                onClick={() => {
                  if (expanded) {
                    setExpandedId(null)
                    setPullingTeam(null)
                  } else {
                    setExpandedId(g.id)
                    setPullingTeam(null)
                  }
                }}
                className="w-full text-left px-4 py-3 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-semibold text-content truncate">{g.name}</div>
                  <Chip color={chipColor}>{chipText}</Chip>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span style={{ color: 'var(--color-muted)' }}>{g.scheduledTime}</span>
                  <span style={{ color: 'var(--color-muted)' }}>·</span>
                  <span className="truncate" style={{ color: resolved.teams.A.color }}>{resolved.teams.A.short}</span>
                  <span style={{ color: 'var(--color-muted)' }}>vs</span>
                  <span className="truncate" style={{ color: resolved.teams.B.color }}>{resolved.teams.B.short}</span>
                  {liveScore && (
                    <span className="ml-auto font-mono font-bold text-content">
                      {liveScore.A} – {liveScore.B}
                    </span>
                  )}
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-4 flex flex-col gap-3">
                  {isLive ? (
                    <Btn variant="primary" size="lg" full onClick={() => resumeGame(g.id)}>
                      ▶  Continue Recording
                    </Btn>
                  ) : isDone ? (
                    <div className="flex gap-2">
                      <Btn variant="primary" size="md" full onClick={() => resumeGame(g.id)}>View Final Stats</Btn>
                      <Btn variant="ghost"   size="md" full>Export</Btn>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-content text-center mb-0.5">Who will pull first?</div>
                      <div className="text-[10px] italic text-center" style={{ color: 'var(--color-muted)' }}>
                        (Who is on Defence?)
                      </div>
                      <div className="flex gap-2">
                        {(['A', 'B'] as TeamId[]).map(t => {
                          const team = resolved.teams[t]
                          const selected = pullingTeam === t
                          return (
                            <button
                              key={t}
                              onClick={(e) => { e.stopPropagation(); setPullingTeam(t) }}
                              className="flex-1 h-11 rounded-lg border text-sm font-semibold transition-all cursor-pointer"
                              style={{
                                background:  selected ? `${team.color}22` : 'transparent',
                                borderColor: selected ? `${team.color}88` : 'var(--color-border)',
                                color:       selected ? team.color : 'var(--color-muted)',
                              }}
                            >
                              {team.name}
                            </button>
                          )
                        })}
                      </div>
                      <Btn
                        variant="primary"
                        size="lg"
                        full
                        disabled={!pullingTeam}
                        onClick={() => pullingTeam && selectGame(g.id, pullingTeam)}
                      >
                        Start Recording
                      </Btn>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* FAB: + New Game (hidden when the empty state already shows the CTA). */}
      {games.length > 0 && (
        <button
          onClick={() => { setExpandedId(NEW_GAME_SENTINEL); setPullingTeam(null) }}
          className="absolute bottom-6 right-5 w-14 h-14 rounded-full flex items-center justify-center cursor-pointer text-2xl font-bold"
          style={{
            background: 'var(--color-team-a)',
            color:      '#fff',
            boxShadow:  '0 6px 18px rgba(0,0,0,0.4)',
          }}
          title="New game"
        >
          +
        </button>
      )}
    </div>
  )
}
