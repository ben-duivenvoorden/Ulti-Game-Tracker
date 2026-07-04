import { useEffect, useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { IconBtn, SettingsIcon, TeamsIcon } from '@/components/ui/Icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PromptSheet } from '@/components/PromptSheet'
import { useGameStore } from '@/core/store'
import { useCompetitions, useGameActions, useRecordingOptions, useScheduledGames, useSession, useTeamsState } from '@/core/selectors'
import { deriveGameState, deriveGameStatus } from '@/core/engine'
import { deriveScheduledGamesState, resolveGameConfig } from '@/core/games/engine'
import type { CompetitionId } from '@/core/games/types'
import { fetchGameSummary, decideResume, type GameSummary } from '@/core/serverLog'
import { abbaRatioLabel } from '@/core/format'
import type { TeamId } from '@/core/types'
import NewGameForm from '@/screens/NewGame'

// Two-level flow: the FIRST screen lists competitions (plus an "Other games"
// bucket); tapping one shows the games inside it. Competition-level settings
// (defaults + enforcement) hang off the gear on each competition row.

export default function GameSetup() {
  const { selectGame, resumeGame, startSegmentFromScore, openGameSettings, openTeamsManager, openCompetitionSettings, addCompetition } = useGameActions()
  const deviceId     = useGameStore(s => s.deviceId)
  const session      = useSession()
  const games        = useScheduledGames()
  const competitions = useCompetitions()
  const teamsState   = useTeamsState()

  const knownComps = new Set(competitions.map(c => c.id))
  const otherGames = games.filter(g => g.competitionId === undefined || !knownComps.has(g.competitionId))

  const options = useRecordingOptions()

  // Which level we're on: null = competitions listing; a CompetitionId or
  // 'other' = that group's games. Transient — every app start lands on the
  // competitions listing.
  const [openComp, setOpenComp] = useState<CompetitionId | 'other' | null>(null)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [newCompOpen, setNewCompOpen] = useState(false)

  // When set, expand the matching card inline to show pulling-team picker.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pullingTeam, setPullingTeam] = useState<TeamId | null>(null)
  // ABBA second-flip outcome (mixed only): which division holds the point-1
  // majority. null = not set → per-point advice stays off for this game.
  const [abbaMajority, setAbbaMajority] = useState<'M' | 'F' | null>(null)

  // Server-side high-water summaries, keyed by game id. Each is the `max`
  // point-position any scorer/device reached for that game (null = no server
  // data / API disabled / offline → fall back to the local session score).
  const [summaries, setSummaries] = useState<Record<number, GameSummary | null>>({})

  const sessionGameId = session?.gameConfig.id ?? null
  const sessionLive   = deriveGameStatus(session) === 'in-progress'

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

  const resetCardState = () => { setExpandedId(null); setPullingTeam(null); setAbbaMajority(null) }

  // Full-screen NewGame form pushes over everything.
  if (newGameOpen) {
    return (
      <NewGameForm
        defaultCompetitionId={typeof openComp === 'number' ? openComp : null}
        onCreated={(newId) => {
          setNewGameOpen(false)
          // Land inside whichever group the game actually went to (the form's
          // competition picker may have been changed).
          const created = deriveScheduledGamesState(useGameStore.getState().scheduledGamesLog).gamesById.get(newId)
          setOpenComp(created?.competitionId !== undefined && knownComps.has(created.competitionId)
            ? created.competitionId
            : 'other')
          setExpandedId(newId); setPullingTeam(null); setAbbaMajority(null)
        }}
        onCancel={() => setNewGameOpen(false)}
      />
    )
  }

  // ─── Level 1: competitions listing ─────────────────────────────────────────
  if (openComp === null) {
    return (
      <div className="h-full flex flex-col bg-bg text-content">
        <ScreenHeader
          kicker="GAME SETUP"
          title="Competitions"
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

        <div className="flex-1 overflow-y-auto">
          {competitions.length === 0 && otherGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
              <div className="text-5xl mb-1 opacity-30">🥏</div>
              <Label>No competitions or games yet</Label>
              <Btn variant="primary" size="md" onClick={() => setNewCompOpen(true)}>
                + New Competition
              </Btn>
              <Btn variant="ghost" size="md" onClick={() => { setNewGameOpen(true); resetCardState() }}>
                + New Game
              </Btn>
            </div>
          ) : (
            <>
              {competitions.map(c => {
                const compGames = games.filter(g => g.competitionId === c.id)
                const hasLive = sessionLive && compGames.some(g => g.id === sessionGameId)
                return (
                  <div key={c.id} className="flex items-stretch border-b border-border">
                    <button
                      onClick={() => { setOpenComp(c.id); resetCardState() }}
                      className="flex-1 min-w-0 text-left px-4 py-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-lg font-semibold text-content truncate">{c.name}</div>
                        {hasLive && <Chip color="var(--color-success)">LIVE</Chip>}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--color-muted)' }}>
                        {compGames.length === 0 ? 'No games yet' : `${compGames.length} game${compGames.length === 1 ? '' : 's'}`}
                      </div>
                    </button>
                    <button
                      onClick={() => openCompetitionSettings(c.id)}
                      className="flex items-center px-4 cursor-pointer"
                      style={{ color: 'var(--color-muted)' }}
                      title={`${c.name} — competition settings`}
                    >
                      <SettingsIcon size={18} />
                    </button>
                  </div>
                )
              })}

              {otherGames.length > 0 && (
                <button
                  onClick={() => { setOpenComp('other'); resetCardState() }}
                  className="w-full text-left px-4 py-4 cursor-pointer border-b border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-lg font-semibold text-content truncate">Other games</div>
                    {sessionLive && otherGames.some(g => g.id === sessionGameId) && (
                      <Chip color="var(--color-success)">LIVE</Chip>
                    )}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {otherGames.length} game{otherGames.length === 1 ? '' : 's'} outside a competition
                  </div>
                </button>
              )}

              <button
                onClick={() => setNewCompOpen(true)}
                className="w-full text-left px-4 py-3.5 cursor-pointer"
                style={{ color: 'var(--color-muted)' }}
              >
                + New competition…
              </button>
            </>
          )}
        </div>

        <PromptSheet
          open={newCompOpen}
          title="New competition"
          label="Competition name"
          placeholder="e.g. Brisbane Parity League"
          confirmLabel="Add"
          onSubmit={name => {
            setNewCompOpen(false)
            if (name.trim().length === 0) return
            const id = addCompetition(name.trim())
            openCompetitionSettings(id)
          }}
          onCancel={() => setNewCompOpen(false)}
        />
      </div>
    )
  }

  // ─── Level 2: games within one competition (or the "Other" bucket) ─────────
  const comp = typeof openComp === 'number' ? competitions.find(c => c.id === openComp) ?? null : null
  const visibleGames = openComp === 'other' ? otherGames : games.filter(g => g.competitionId === openComp)

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <ScreenHeader
        onBack={() => { setOpenComp(null); resetCardState() }}
        backTitle="Competitions"
        kicker="COMPETITION"
        title={comp ? comp.name : 'Other games'}
        right={comp ? (
          <IconBtn onClick={() => openCompetitionSettings(comp.id)} title="Competition settings">
            <SettingsIcon />
          </IconBtn>
        ) : undefined}
      />

      {/* Game list */}
      <div className="flex-1 overflow-y-auto">
        {visibleGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-5xl mb-4 opacity-30">🥏</div>
            <Label className="mb-3">No games scheduled yet</Label>
            <Btn variant="primary" size="md" onClick={() => { setNewGameOpen(true); resetCardState() }}>
              + New Game
            </Btn>
          </div>
        ) : visibleGames.map(g => {
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
                    setPullingTeam(null); setAbbaMajority(null)
                  } else {
                    setExpandedId(g.id)
                    setPullingTeam(null); setAbbaMajority(null)
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
                      {options.abba && options.gameMode === 'mixed' && options.lineRatio.M !== options.lineRatio.F && (
                        <AbbaRatioPicker
                          lineRatio={options.lineRatio}
                          value={abbaMajority}
                          onChange={setAbbaMajority}
                        />
                      )}
                      <Btn
                        variant="primary"
                        size="lg"
                        full
                        disabled={!pullingTeam}
                        onClick={() => pullingTeam && selectGame(g.id, pullingTeam, abbaMajority ?? undefined)}
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
      {visibleGames.length > 0 && (
        <button
          onClick={() => { setNewGameOpen(true); resetCardState() }}
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

// ─── ABBA point-1 ratio picker ───────────────────────────────────────────────
// Mixed division only: the second flip's winner picks the gender ratio for
// point 1 (WFDF Ratio Rule A); the prescription then alternates every two
// points. Optional — tap the selected choice again to clear it and keep the
// fixed-ratio behaviour.

function AbbaRatioPicker({ lineRatio, value, onChange }: {
  lineRatio: { M: number; F: number }
  value: 'M' | 'F' | null
  onChange: (v: 'M' | 'F' | null) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-content text-center">Point 1 ratio (ABBA)</div>
      <div className="text-[10px] italic text-center" style={{ color: 'var(--color-muted)' }}>
        (Second flip — optional; sets per-point ratio advice)
      </div>
      <div className="flex gap-2">
        {(['M', 'F'] as const).map(majority => {
          const selected = value === majority
          return (
            <button
              key={majority}
              onClick={e => { e.stopPropagation(); onChange(selected ? null : majority) }}
              className="flex-1 h-11 rounded-lg border text-sm font-semibold transition-all cursor-pointer"
              style={{
                background:  selected ? 'var(--color-surf-2)' : 'transparent',
                borderColor: selected ? 'var(--color-border-2)' : 'var(--color-border)',
                color:       selected ? 'var(--color-content)' : 'var(--color-muted)',
              }}
            >
              {abbaRatioLabel(majority, lineRatio)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
