import { useEffect, useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { IconBtn, SettingsIcon, TeamsIcon } from '@/components/ui/Icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useGameStore } from '@/core/store'
import { useGameActions, useScheduledGames, useSession, useTeamsState } from '@/core/selectors'
import { deriveGameState, deriveGameStatus } from '@/core/engine'
import { resolveGameConfig } from '@/core/games/engine'
import { fetchGameSummary, decideResume, type GameSummary } from '@/core/serverLog'
import type { TeamId } from '@/core/types'
import NewGameForm from '@/screens/NewGame'

// Sentinel that pushes the NewGame form full-screen.
const NEW_GAME_SENTINEL = -1

export default function GameSetup() {
  const { selectGame, resumeGame, startSegmentFromScore, openGameSettings, openTeamsManager } = useGameActions()
  const deviceId   = useGameStore(s => s.deviceId)
  const session    = useSession()
  const games      = useScheduledGames()
  const teamsState = useTeamsState()

  // When set, expand the matching card inline to show pulling-team picker.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pullingTeam, setPullingTeam] = useState<TeamId | null>(null)

  // Server-side high-water summaries, keyed by game id. Each is the `max`
  // point-position any scorer/device reached for that game (null = no server
  // data / API disabled / offline → fall back to the local session score).
  const [summaries, setSummaries] = useState<Record<number, GameSummary | null>>({})

  const sessionGameId = session?.gameConfig.id ?? null

  // Fetch high-water summaries for the listed games when the menu shows. Small
  // N (a handful of games); per-game fetch is fine. Re-runs when the set of
  // games changes; offline/disabled fetches resolve to null and no-op.
  const gameIdsKey = games.map(g => g.id).join(',')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        games.map(async g => [g.id, await fetchGameSummary(g.id, resolveGameConfig(g, teamsState))] as const),
      )
      if (!cancelled) setSummaries(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
    // teamsState is intentionally omitted — re-fetch only when the game set
    // changes, not on every roster-derive identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameIdsKey])

  // Open a game for recording, applying the continue-vs-fork rule against the
  // server high-water: keep appending to my own segment if I'm still at/ahead
  // of it, otherwise seed a fresh segment from where the furthest scorer left
  // off. Falls back to plain local resume when there's no server summary.
  function openGame(gameId: number) {
    const summary = summaries[gameId]
    const local = (session && sessionGameId === gameId) ? session : null
    if (summary) {
      const decision = decideResume(local, summary, deviceId)
      if (decision.kind === 'fork') {
        startSegmentFromScore(gameId, decision.scoreA, decision.scoreB, decision.offence)
        return
      }
    }
    if (local) resumeGame(gameId)
  }

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
      <ScreenHeader
        kicker="GAME SETUP"
        title="Games"
        right={
          <>
            <IconBtn onClick={openTeamsManager} title="Manage teams">
              <TeamsIcon />
            </IconBtn>
            <IconBtn onClick={openGameSettings} title="Recording settings">
              <SettingsIcon />
            </IconBtn>
          </>
        }
      />

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
          // Badge score = high-water: the server summary unioned with the local
          // session (local may be ahead of the last sync). Furthest point wins.
          const localState = liveSession ? deriveGameState(liveSession) : null
          const summary    = summaries[g.id] ?? null
          const localPI    = localState ? localState.pointIndex : -1
          const useServer  = !!summary && summary.pointIndex > localPI
          const liveScore  = useServer ? summary!.score : (localState?.score ?? summary?.score ?? null)
          const multiSegment = !!summary && summary.segmentCount > 1
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
                  // LIVE games have a single follow-up action (Continue
                  // Recording) and no other inputs — skip the expansion
                  // and jump straight into Live Entry (continuing my own
                  // segment, or forking from the high-water if a peer passed me).
                  if (isLive) {
                    openGame(g.id)
                    return
                  }
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
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="text-lg font-semibold text-content truncate">{g.name}</div>
                  <Chip color={chipColor}>{chipText}</Chip>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>{g.scheduledTime}</span>
                  <span style={{ color: 'var(--color-muted)' }}>·</span>
                  <Chip color={resolved.teams.A.color} variant="solid">{resolved.teams.A.short}</Chip>
                  <span style={{ color: 'var(--color-muted)' }}>vs</span>
                  <Chip color={resolved.teams.B.color} variant="solid">{resolved.teams.B.short}</Chip>
                  {liveScore && (
                    <span className="ml-auto flex items-center gap-1.5 font-mono font-bold text-base text-content">
                      {multiSegment && (
                        <span
                          title={`${summary!.segmentCount} scorers recording`}
                          style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--color-success)' }}
                        />
                      )}
                      {liveScore.A} – {liveScore.B}
                    </span>
                  )}
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-4 flex flex-col gap-3">
                  {isDone ? (
                    <Btn variant="primary" size="md" full onClick={() => resumeGame(g.id)}>View Final Stats</Btn>
                  ) : (
                    <>
                      {summary && summary.segmentCount > 0 && (
                        <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label>
                              In progress · {summary.segmentCount} scorer{summary.segmentCount > 1 ? 's' : ''}
                            </Label>
                            <span className="font-mono font-bold text-base text-content">
                              {summary.score.A} – {summary.score.B}
                            </span>
                          </div>
                          {summary.segments.map(s => (
                            <div key={s.segmentId} className="flex items-center justify-between text-xs" style={{ color: 'var(--color-muted)' }}>
                              <span className="truncate">{s.anchored ? '↪ ' : ''}{s.deviceId.slice(0, 10)}</span>
                              <span className="font-mono">{s.score.A}–{s.score.B}</span>
                            </div>
                          ))}
                          <Btn variant="primary" size="md" full onClick={(e) => { e.stopPropagation(); openGame(g.id) }}>
                            Continue from {summary.score.A}–{summary.score.B}
                          </Btn>
                          <div className="text-[10px] italic text-center" style={{ color: 'var(--color-muted)' }}>
                            or start fresh below
                          </div>
                        </div>
                      )}
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
