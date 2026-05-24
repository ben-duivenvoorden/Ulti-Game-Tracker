import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { useSession, useDerivedState, useRecordingOptions, useSuggestedTransition } from '@/core/selectors'
import { useGameStore, seedDefaultLine } from '@/core/store'
import { inkOn } from '@/core/contrast'
import type { Player, GameMode, TeamId } from '@/core/types'

export default function LineSelection() {
  const session        = useSession()
  const state          = useDerivedState()
  const isInjurySub    = useGameStore(s => s.isInjurySub)
  const confirmLine    = useGameStore(s => s.confirmLine)
  const backToGameList = useGameStore(s => s.backToGameList)
  const swapSides      = useGameStore(s => s.swapSides)
  const toggleSwap     = useGameStore(s => s.toggleSwapSides)
  const openTeamsManager = useGameStore(s => s.openTeamsManager)
  const addPlayer      = useGameStore(s => s.addPlayer)
  const triggerHalfTime = useGameStore(s => s.triggerHalfTime)
  const triggerEndGame  = useGameStore(s => s.triggerEndGame)
  const { lineRatio, gameMode } = useRecordingOptions()
  const suggestion     = useSuggestedTransition()
  const [dismissed, setDismissed] = useState(false)

  const rosters = session?.gameConfig.rosters
  const teams   = session?.gameConfig.teams

  // Seed selection from the derived activeLine if it's been set (mid-game), or
  // from a sensible default of the roster otherwise (very first point).
  const initialA = (state && state.activeLine.A.length > 0) ? state.activeLine.A : (rosters ? seedDefaultLine(rosters.A) : [])
  const initialB = (state && state.activeLine.B.length > 0) ? state.activeLine.B : (rosters ? seedDefaultLine(rosters.B) : [])
  const [selA, setSelA] = useState<Player[]>(initialA)
  const [selB, setSelB] = useState<Player[]>(initialB)
  const [overrideOpen, setOverrideOpen] = useState(false)

  if (!rosters || !teams) return null

  const toggle = (player: Player, sel: Player[], setSel: (p: Player[]) => void) => {
    if (sel.find(p => p.id === player.id)) {
      setSel(sel.filter(p => p.id !== player.id))
    } else {
      setSel([...sel, player])
    }
  }

  const validateA = validateLine(selA, gameMode, lineRatio)
  const validateB = validateLine(selB, gameMode, lineRatio)
  const linesValid = validateA.ok && validateB.ok

  const onConfirmClick = () => {
    if (linesValid) {
      confirmLine(selA, selB)
    } else {
      setOverrideOpen(true)
    }
  }

  const score = state?.score ?? { A: 0, B: 0 }
  const teamLeft   = swapSides ? 'B' : 'A'
  const teamCentre = swapSides ? 'A' : 'B'

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Row 1: back · score · (spacer). Mirrors the LiveEntry header so the
          score stays visible across screen transitions. */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 h-12"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={backToGameList}
          className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
          title="Back to games"
        >
          ←
        </button>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
          <span
            className="text-sm font-bold truncate text-right flex-1"
            style={{ color: teams[teamLeft].color }}
          >
            {teams[teamLeft].name}
          </span>
          <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score[teamLeft]}</strong>
          <span className="text-dim text-base flex-shrink-0">–</span>
          <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score[teamCentre]}</strong>
          <span
            className="text-sm font-bold truncate text-left flex-1"
            style={{ color: teams[teamCentre].color }}
          >
            {teams[teamCentre].name}
          </span>
        </div>
        {/* Right-side spacer keeps the score visually centred and matches the
            width of the back arrow on the left. */}
        <span className="w-5" aria-hidden />
      </div>

      {/* Suggestion banner — fires when the score crosses halfTimeAt or
          scoreCapAt and the corresponding event isn't already in the log.
          Recorder confirms (emits the structural event) or dismisses (defers
          until the next goal pushes us back into the threshold). */}
      {suggestion && !dismissed && !isInjurySub && (
        <div
          className="flex-shrink-0 flex items-stretch text-[11px] font-semibold tracking-widest"
          style={{
            background:   'var(--color-warn-bg)',
            color:        'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
        >
          <div className="flex-1 flex items-center justify-center px-3 py-2">
            {suggestion === 'half-time'
              ? 'HALF-TIME SCORE REACHED — CALL HALF TIME?'
              : 'SCORE CAP REACHED — END THE GAME?'}
          </div>
          <button
            onClick={() => {
              if (suggestion === 'half-time') triggerHalfTime()
              else triggerEndGame()
            }}
            className="px-3 cursor-pointer font-semibold"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
            title={suggestion === 'half-time' ? 'Record half time' : 'End the game'}
          >
            {suggestion === 'half-time' ? 'CALL HALF' : 'END GAME'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 cursor-pointer"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
            title="Defer — will re-fire after the next goal if still applicable"
          >
            NOT YET
          </button>
        </div>
      )}

      {/* Row 2: title (well clear of the back arrow) + Manage teams + Confirm button. */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border">
        <Label block>
          {isInjurySub ? 'INJURY SUBSTITUTION — MID-POINT' : 'LINE SELECTION'}
        </Label>
        <div className="flex items-center gap-3">
          <button
            onClick={openTeamsManager}
            className="text-[10px] font-mono tracking-widest uppercase cursor-pointer transition-colors hover:text-content"
            style={{ color: 'var(--color-muted)' }}
            title="Manage teams + players"
          >
            ⚙ Manage teams
          </button>
          <Btn variant="primary" size="md" onClick={onConfirmClick}>
            {isInjurySub ? 'Confirm Substitutions' : 'Confirm Line'}
          </Btn>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Swap-sides toggle, centred between the two team names. */}
        <button
          onClick={toggleSwap}
          className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full border flex items-center justify-center text-base leading-none transition-colors cursor-pointer"
          style={{
            background:  'var(--color-surf-2)',
            borderColor: 'var(--color-border-2)',
            color:       'var(--color-muted)',
          }}
          title="Swap team sides"
        >
          ⇆
        </button>

        {(() => {
          const leftSlot:  TeamId = swapSides ? 'B' : 'A'
          const rightSlot: TeamId = swapSides ? 'A' : 'B'
          const globalIdFor = (slot: TeamId) =>
            slot === 'A' ? session!.gameConfig.teamAGlobalId : session!.gameConfig.teamBGlobalId
          return (
            <>
              <TeamColumn
                players={rosters[leftSlot]}
                selected={swapSides ? selB : selA}
                color={teams[leftSlot].color}
                label={teams[leftSlot].name}
                onToggle={p => toggle(p, swapSides ? selB : selA, swapSides ? setSelB : setSelA)}
                onSetAll={swapSides ? setSelB : setSelA}
                gameMode={gameMode}
                targetM={lineRatio.M}
                targetF={lineRatio.F}
                onAddPlayer={(name, gender, jersey) =>
                  addPlayer(globalIdFor(leftSlot), name, gender,
                    jersey !== undefined ? { jerseyNumber: jersey } : undefined)
                }
              />
              <TeamColumn
                players={rosters[rightSlot]}
                selected={swapSides ? selA : selB}
                color={teams[rightSlot].color}
                label={teams[rightSlot].name}
                onToggle={p => toggle(p, swapSides ? selA : selB, swapSides ? setSelA : setSelB)}
                onSetAll={swapSides ? setSelA : setSelB}
                align="right"
                gameMode={gameMode}
                targetM={lineRatio.M}
                targetF={lineRatio.F}
                onAddPlayer={(name, gender, jersey) =>
                  addPlayer(globalIdFor(rightSlot), name, gender,
                    jersey !== undefined ? { jerseyNumber: jersey } : undefined)
                }
              />
            </>
          )
        })()}
      </div>

      {overrideOpen && (
        <OverrideDialog
          teamAName={teams.A.short}
          teamBName={teams.B.short}
          validateA={validateA}
          validateB={validateB}
          onCancel={() => setOverrideOpen(false)}
          onConfirm={() => {
            setOverrideOpen(false)
            confirmLine(selA, selB)
          }}
        />
      )}
    </div>
  )
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface LineValidation {
  ok: boolean
  warnings: string[]
}

function validateLine(sel: Player[], mode: GameMode, ratio: { M: number; F: number }): LineValidation {
  const target = ratio.M + ratio.F
  const total  = sel.length
  const warnings: string[] = []

  if (total !== target) {
    const delta = total - target
    warnings.push(delta > 0 ? `${delta} too many` : `${-delta} short`)
  }

  if (mode === 'mixed') {
    const m = sel.filter(p => p.gender === 'M').length
    const f = sel.filter(p => p.gender === 'F').length
    if (m !== ratio.M) warnings.push(`M ${m}/${ratio.M}`)
    if (f !== ratio.F) warnings.push(`F ${f}/${ratio.F}`)
  }

  return { ok: warnings.length === 0, warnings }
}

// ─── Team column ──────────────────────────────────────────────────────────────

interface TeamColumnProps {
  players: Player[]
  selected: Player[]
  color: string
  label: string
  onToggle: (p: Player) => void
  onSetAll: (next: Player[]) => void
  align?: 'right'
  gameMode: GameMode
  targetM: number
  targetF: number
  onAddPlayer: (name: string, gender: 'M' | 'F', jerseyNumber?: number) => void
}

function TeamColumn({
  players, selected, color, label, onToggle, onSetAll, align,
  gameMode, targetM, targetF, onAddPlayer,
}: TeamColumnProps) {
  const isRight = align === 'right'
  const total  = selected.length
  const countM = selected.filter(p => p.gender === 'M').length
  const countF = selected.filter(p => p.gender === 'F').length
  const target = targetM + targetF
  const allSelected = players.length > 0 && total === players.length

  const chipColor = (count: number, t: number) =>
    count > t ? 'var(--color-danger)'
      : count === t ? 'var(--color-success)'
      : count > 0 ? 'var(--color-warn)'
      : 'var(--color-muted)'

  return (
    <div className={`flex-1 flex flex-col ${!isRight ? 'border-r border-border' : ''}`}>
      {/* Team header — All/None + count chips grouped on the outside (above the ticks),
          team name bunched toward the centre divider. */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-shrink-0"
        style={{ flexDirection: isRight ? 'row-reverse' : 'row' }}
      >
        <div
          className="flex items-center gap-2"
          style={{ flexDirection: isRight ? 'row-reverse' : 'row' }}
        >
          <button
            type="button"
            onClick={() => onSetAll(allSelected ? [] : players)}
            className="text-xs font-mono uppercase tracking-widest px-2.5 h-7 rounded border cursor-pointer transition-colors"
            style={{
              color: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              background: 'transparent',
            }}
            title={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? 'None' : 'All'}
          </button>
          {gameMode === 'mixed' ? (
            <>
              <Chip color={chipColor(countM, targetM)}>M {countM}/{targetM}</Chip>
              <Chip color={chipColor(countF, targetF)}>F {countF}/{targetF}</Chip>
            </>
          ) : (
            <Chip color={chipColor(total, target)}>{total}/{target}</Chip>
          )}
        </div>

        {/* Reserved gutter on the centre-divider side so the team name doesn't
            run under the swap-sides button. */}
        <span
          className="text-base font-bold"
          style={{ color, [isRight ? 'marginLeft' : 'marginRight']: 22 }}
        >
          {label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 relative">
        {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
          const isOn = !!selected.find(s => s.id === p.id)
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p)}
              className="flex items-center gap-3 h-13 px-4 rounded-lg border cursor-pointer transition-all"
              style={{
                background:  isOn ? `${color}18` : 'var(--color-surf-2)',
                borderColor: isOn ? `${color}55` : 'var(--color-border)',
                flexDirection: isRight ? 'row-reverse' : 'row',
                height: 52,
              }}
            >
              <span
                className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm border transition-all"
                style={{
                  background:  isOn ? color : 'transparent',
                  borderColor: isOn ? color : 'var(--color-dim)',
                  // Luminance-aware tick: white on dark colours, dark on
                  // light colours (e.g. Lizards Eastside in white today).
                  color:       isOn ? inkOn(color) : 'var(--color-dim)',
                }}
              >
                {isOn && '✓'}
              </span>
              {gameMode === 'mixed' && (
                <span
                  className="flex-shrink-0 w-5 text-center text-xs font-mono font-bold"
                  style={{ color: p.gender === 'F' ? 'var(--color-warn)' : 'var(--color-muted)' }}
                  title={p.gender === 'F' ? 'Female-matching' : 'Male-matching'}
                >
                  {p.gender}
                </span>
              )}
              <span
                className="text-lg flex-1"
                style={{
                  fontWeight: isOn ? 600 : 400,
                  color: isOn ? 'var(--color-content)' : 'var(--color-muted)',
                  textAlign: isRight ? 'right' : 'left',
                }}
              >
                {/* Jersey number sits on the centre-divider side of the name. */}
                {isRight && p.jerseyNumber !== undefined && (
                  <span className="font-mono mr-2 text-base" style={{ color: 'var(--color-dim)' }}>
                    #{p.jerseyNumber}
                  </span>
                )}
                {p.name}
                {!isRight && p.jerseyNumber !== undefined && (
                  <span className="font-mono ml-2 text-base" style={{ color: 'var(--color-dim)' }}>
                    #{p.jerseyNumber}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        <AddPlayerRow color={color} onAdd={onAddPlayer} gameMode={gameMode} isRight={isRight} />
      </div>
    </div>
  )
}

function AddPlayerRow({ color, onAdd, gameMode, isRight }: {
  color:    string
  onAdd:    (name: string, gender: 'M' | 'F', jersey?: number) => void
  gameMode: GameMode
  isRight:  boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'M' | 'F'>('M')
  const [jersey, setJersey] = useState('')

  const reset = () => { setName(''); setJersey(''); setGender('M'); setOpen(false) }
  const submit = () => {
    const n = name.trim()
    if (!n) return
    const j = jersey === '' ? undefined : Number(jersey)
    onAdd(n, gender, j)
    reset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-13 px-4 rounded-lg border border-dashed cursor-pointer transition-colors flex items-center justify-center"
        style={{
          color, borderColor: `${color}55`, background: `${color}0a`, height: 52,
          flexDirection: isRight ? 'row-reverse' : 'row',
        }}
        title="Add a new player to this team"
      >
        <span className="text-sm font-semibold">+ Add player</span>
      </button>
    )
  }

  return (
    <div
      className="p-2 rounded-lg border flex flex-col gap-2"
      style={{ background: 'var(--color-surf-2)', borderColor: `${color}55` }}
    >
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') reset() }}
        placeholder="Player name…"
        autoFocus
        className="h-9 px-3 rounded-md border text-sm text-content"
        style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border-2)' }}
      />
      <div className="flex items-center gap-2">
        {gameMode === 'mixed' && (
          <select
            value={gender}
            onChange={e => setGender(e.target.value as 'M' | 'F')}
            className="h-9 px-2 rounded-md border text-sm font-mono text-content cursor-pointer"
            style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border-2)' }}
          >
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        )}
        <input
          type="number"
          value={jersey}
          onChange={e => setJersey(e.target.value)}
          placeholder="#"
          className="w-16 h-9 px-2 rounded-md border text-sm font-mono text-center text-content"
          style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border-2)' }}
        />
        <div className="flex gap-1.5 ml-auto">
          <Btn variant="ghost"   size="sm" onClick={reset}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={submit} disabled={name.trim().length === 0}>Add</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Override dialog ──────────────────────────────────────────────────────────

interface OverrideDialogProps {
  teamAName: string
  teamBName: string
  validateA: LineValidation
  validateB: LineValidation
  onCancel: () => void
  onConfirm: () => void
}

function OverrideDialog({ teamAName, teamBName, validateA, validateB, onCancel, onConfirm }: OverrideDialogProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-5 w-full max-w-sm flex flex-col gap-3"
        style={{ background: 'var(--color-surf)', border: '1px solid var(--color-border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-sm font-bold text-content">Confirm with mismatch?</div>
        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          The line(s) below don't match the configured composition. You can override and continue, or cancel and adjust.
        </div>

        {!validateA.ok && (
          <div
            className="px-3 py-2 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)', border: '1px solid var(--color-warn)' }}
          >
            <span className="font-bold mr-1.5">{teamAName}:</span>{validateA.warnings.join(' · ')}
          </div>
        )}
        {!validateB.ok && (
          <div
            className="px-3 py-2 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)', border: '1px solid var(--color-warn)' }}
          >
            <span className="font-bold mr-1.5">{teamBName}:</span>{validateB.warnings.join(' · ')}
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <Btn variant="ghost"   size="md" full onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" size="md" full onClick={onConfirm}>Override &amp; Continue</Btn>
        </div>
      </div>
    </div>
  )
}
