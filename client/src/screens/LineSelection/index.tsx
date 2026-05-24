import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
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
  const [activeTab, setActiveTab] = useState<TeamId>('A')

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
  const globalIdFor = (slot: TeamId) =>
    slot === 'A' ? session!.gameConfig.teamAGlobalId : session!.gameConfig.teamBGlobalId

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Header — back · score · Confirm. Three-column grid with equal-width
          side columns (88 px) keeps the score perfectly centred on the page
          regardless of how wide the Confirm button is. The score's middle
          column has page_width − 2 × side_width to work with. */}
      <div
        className="flex-shrink-0 grid items-center h-12"
        style={{
          gridTemplateColumns: '88px 1fr 88px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-start pl-3">
          <button
            onClick={backToGameList}
            className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
            title="Back to games"
          >
            ←
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 min-w-0 px-2">
          <span
            className="text-sm font-bold truncate text-right flex-1"
            style={{ color: teams.A.color }}
            title={teams.A.name}
          >
            {teams.A.short}
          </span>
          <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.A}</strong>
          <span className="text-dim text-base flex-shrink-0">–</span>
          <strong className="text-3xl font-black tabular-nums leading-none text-content flex-shrink-0">{score.B}</strong>
          <span
            className="text-sm font-bold truncate text-left flex-1"
            style={{ color: teams.B.color }}
            title={teams.B.name}
          >
            {teams.B.short}
          </span>
        </div>
        <div className="flex items-center justify-end pr-3">
          <Btn variant="primary" size="sm" onClick={onConfirmClick}>
            {isInjurySub ? 'Sub' : 'Confirm'}
          </Btn>
        </div>
      </div>

      {/* Half-time / end-game suggestion banner */}
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
          >
            {suggestion === 'half-time' ? 'CALL HALF' : 'END GAME'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 cursor-pointer"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
          >
            NOT YET
          </button>
        </div>
      )}

      {/* Injury-sub banner replaces the tab switcher; for normal line
          selection the tab switcher carries the screen's identity. */}
      {isInjurySub && (
        <div
          className="flex-shrink-0 flex items-center justify-center px-3 py-2 text-[11px] font-semibold tracking-widest"
          style={{
            background:   'var(--color-warn-bg)',
            color:        'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
        >
          INJURY SUB — MID-POINT
        </div>
      )}

      {/* Tab switcher — between-points only. Injury sub locks the team. */}
      {!isInjurySub && (
        <div className="flex-shrink-0 flex border-b border-border">
          <TeamTab
            label={teams.A.name}
            color={teams.A.color}
            active={activeTab === 'A'}
            ratioOk={validateA.ok}
            onClick={() => setActiveTab('A')}
          />
          <TeamTab
            label={teams.B.name}
            color={teams.B.color}
            active={activeTab === 'B'}
            ratioOk={validateB.ok}
            onClick={() => setActiveTab('B')}
          />
        </div>
      )}

      {/* Manage teams secondary nav */}
      <div className="flex-shrink-0 px-3 py-1.5 flex justify-end border-b border-border">
        <button
          onClick={openTeamsManager}
          className="text-[10px] font-mono tracking-widest uppercase cursor-pointer transition-colors hover:text-content"
          style={{ color: 'var(--color-muted)' }}
        >
          ⚙ Manage teams
        </button>
      </div>

      {/* Active team's roster */}
      <div className="flex-1 overflow-hidden">
        {(() => {
          const slot: TeamId = isInjurySub
            // In injury-sub mode, lock to the team whose active line we're
            // editing — the engine drives this off the affected team's
            // mid-point change; we infer it from the diff side that's most
            // likely. For now, the tab follows the user's selection.
            ? activeTab
            : activeTab
          const sel = slot === 'A' ? selA : selB
          const setSel = slot === 'A' ? setSelA : setSelB
          return (
            <TeamPanel
              players={rosters[slot]}
              selected={sel}
              color={teams[slot].color}
              onToggle={p => toggle(p, sel, setSel)}
              onSetAll={setSel}
              gameMode={gameMode}
              targetM={lineRatio.M}
              targetF={lineRatio.F}
              onAddPlayer={(name, gender, jersey) =>
                addPlayer(globalIdFor(slot), name, gender,
                  jersey !== undefined ? { jerseyNumber: jersey } : undefined)
              }
            />
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

// ─── Team tab ────────────────────────────────────────────────────────────────

function TeamTab({
  label, color, active, ratioOk, onClick,
}: {
  label:   string
  color:   string
  active:  boolean
  ratioOk: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-3 px-2 cursor-pointer flex items-center justify-center gap-2 text-sm font-semibold"
      style={{
        background:   active ? `${color}18` : 'transparent',
        color:        active ? color        : 'var(--color-muted)',
        borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
      }}
    >
      <span className="truncate">{label}</span>
      <span
        className="flex-shrink-0 w-2 h-2 rounded-full"
        style={{ background: ratioOk ? 'var(--color-success)' : 'var(--color-warn)' }}
        title={ratioOk ? 'Line OK' : 'Line off-ratio'}
      />
    </button>
  )
}

// ─── Validation ──────────────────────────────────────────────────────────────

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

// ─── Team panel (single team, full width) ───────────────────────────────────

interface TeamPanelProps {
  players: Player[]
  selected: Player[]
  color: string
  onToggle: (p: Player) => void
  onSetAll: (next: Player[]) => void
  gameMode: GameMode
  targetM: number
  targetF: number
  onAddPlayer: (name: string, gender: 'M' | 'F', jerseyNumber?: number) => void
}

function TeamPanel({
  players, selected, color, onToggle, onSetAll,
  gameMode, targetM, targetF, onAddPlayer,
}: TeamPanelProps) {
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
    <div className="h-full flex flex-col">
      {/* Counter row */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => onSetAll(allSelected ? [] : players)}
          className="text-xs font-mono uppercase tracking-widest px-2.5 h-7 rounded border cursor-pointer transition-colors"
          style={{ color: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
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

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
          const isOn = !!selected.find(s => s.id === p.id)
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p)}
              className="flex items-center gap-3 px-4 rounded-lg border cursor-pointer transition-all"
              style={{
                background:  isOn ? `${color}18` : 'var(--color-surf-2)',
                borderColor: isOn ? `${color}55` : 'var(--color-border)',
                height: 52,
              }}
            >
              <span
                className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm border transition-all"
                style={{
                  background:  isOn ? color : 'transparent',
                  borderColor: isOn ? color : 'var(--color-dim)',
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
                className="text-base flex-1 text-left"
                style={{
                  fontWeight: isOn ? 600 : 400,
                  color: isOn ? 'var(--color-content)' : 'var(--color-muted)',
                }}
              >
                {p.name}
                {p.jerseyNumber !== undefined && (
                  <span className="font-mono ml-2 text-sm" style={{ color: 'var(--color-dim)' }}>
                    #{p.jerseyNumber}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        <AddPlayerRow color={color} onAdd={onAddPlayer} gameMode={gameMode} />
      </div>
    </div>
  )
}

function AddPlayerRow({ color, onAdd, gameMode }: {
  color:    string
  onAdd:    (name: string, gender: 'M' | 'F', jersey?: number) => void
  gameMode: GameMode
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
        className="px-4 rounded-lg border border-dashed cursor-pointer transition-colors flex items-center justify-center"
        style={{ color, borderColor: `${color}55`, background: `${color}0a`, height: 52 }}
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

// ─── Override dialog ─────────────────────────────────────────────────────────

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
