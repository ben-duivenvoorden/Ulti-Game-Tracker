import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { IconBtn, SettingsIcon, TeamsIcon, BackIcon, CheckIcon } from '@/components/ui/Icons'
import { ScorerInfoButton } from '@/components/ScorerInfoButton'
import { useSession, useDerivedState, useRecordingOptions } from '@/core/selectors'
import { useGameStore, seedDefaultLine } from '@/core/store'
import { inkOn } from '@/core/contrast'
import { pickDisplayNames } from '@/core/teams/shortName'
import { firstNameKey } from '@/core/teams/shortName'
import type { Player, GameMode, TeamId } from '@/core/types'

// See Header.tsx — same convention. Score header is the tight context.
const SCORE_NAME_FIT_THRESHOLD = 10

export default function LineSelection() {
  const session        = useSession()
  const state          = useDerivedState()
  const isInjurySub    = useGameStore(s => s.isInjurySub)
  const confirmLine    = useGameStore(s => s.confirmLine)
  const backToGameList = useGameStore(s => s.backToGameList)
  const openTeamsManager = useGameStore(s => s.openTeamsManager)
  const openGameSettings = useGameStore(s => s.openGameSettings)
  const addPlayer      = useGameStore(s => s.addPlayer)
  const options        = useRecordingOptions()
  const { lineRatio, gameMode, lineSize } = options

  const rosters = session?.gameConfig.rosters
  const teams   = session?.gameConfig.teams

  // Seed selection from the derived activeLine if it's been set (mid-game), or
  // from a sensible default of the roster otherwise (very first point).
  const initialA = (state && state.activeLine.A.length > 0) ? state.activeLine.A : (rosters ? seedDefaultLine(rosters.A, options) : [])
  const initialB = (state && state.activeLine.B.length > 0) ? state.activeLine.B : (rosters ? seedDefaultLine(rosters.B, options) : [])
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

  const validateA = validateLine(selA, gameMode, lineRatio, lineSize)
  const validateB = validateLine(selB, gameMode, lineRatio, lineSize)

  // Running-start: a partial / short line is fine — the recorder fills the
  // empty `+` slots mid-point. Only an OVER-quota gender split (mixed mode,
  // e.g. 4 FMP where 3 are expected) is worth a confirm-with-mismatch prompt.
  const onConfirmClick = () => {
    if (validateA.overfill || validateB.overfill) {
      setOverrideOpen(true)
    } else {
      confirmLine(selA, selB)
    }
  }

  const score = state?.score ?? { A: 0, B: 0 }
  const headerNames = pickDisplayNames(teams.A, teams.B, SCORE_NAME_FIT_THRESHOLD)
  const globalIdFor = (slot: TeamId) =>
    slot === 'A' ? session!.gameConfig.teamAGlobalId : session!.gameConfig.teamBGlobalId

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Header — back · score · Confirm. Three-column grid with equal-width
          side columns (88 px) keeps the score perfectly centred on the page
          regardless of how wide the Confirm button is. The score's middle
          column has page_width − 2 × side_width to work with. */}
      <div
        className="flex-shrink-0 grid items-center h-16"
        style={{
          gridTemplateColumns: '100px 1fr 100px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-start pl-3">
          <button
            onClick={backToGameList}
            className="text-muted hover:text-content transition-colors cursor-pointer flex items-center leading-none"
            title="Back to games"
          >
            <BackIcon size={20} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 min-w-0 px-2">
          <span className="flex-1 flex justify-end min-w-0">
            <span
              className="text-sm font-bold truncate px-2 py-0.5 rounded"
              style={{ background: teams.A.color, color: inkOn(teams.A.color) }}
              title={teams.A.name}
            >
              {headerNames.A}
            </span>
          </span>
          <strong className="text-[34px] font-display font-bold tabular-nums leading-none text-content flex-shrink-0 ml-2">{score.A}</strong>
          <span className="text-dim text-base flex-shrink-0">–</span>
          <strong className="text-[34px] font-display font-bold tabular-nums leading-none text-content flex-shrink-0 mr-2">{score.B}</strong>
          <span className="flex-1 flex justify-start min-w-0">
            <span
              className="text-sm font-bold truncate px-2 py-0.5 rounded"
              style={{ background: teams.B.color, color: inkOn(teams.B.color) }}
              title={teams.B.name}
            >
              {headerNames.B}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-end pr-3">
          <Btn variant="primary" size="md" onClick={onConfirmClick}>
            {isInjurySub ? 'Sub' : 'Confirm'}
          </Btn>
        </div>
      </div>

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

      {/* Info + Teams + Settings icons — large tap targets, sibling affordances. */}
      <div className="flex-shrink-0 px-2 py-1 flex justify-end items-center gap-1 border-b border-border">
        <ScorerInfoButton />
        <IconBtn onClick={openTeamsManager} title="Manage teams">
          <TeamsIcon />
        </IconBtn>
        <IconBtn onClick={openGameSettings} title="Recording settings">
          <SettingsIcon />
        </IconBtn>
      </div>

      {/* Active team's roster */}
      <div className="flex-1 overflow-hidden">
        {(() => {
          const slot: TeamId = activeTab
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
              lineSize={lineSize}
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
      className="flex-1 py-3 px-2 cursor-pointer flex items-center justify-center gap-2 text-base font-semibold"
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
  /** Exact composition match — drives the green/amber tab dot. */
  ok: boolean
  /** Over quota: too many players overall, or (mixed) too many of a gender.
   *  This is the only state that prompts a confirm-with-mismatch dialog —
   *  under-filled lines are a valid running start. */
  overfill: boolean
  warnings: string[]
}

function validateLine(sel: Player[], mode: GameMode, ratio: { M: number; F: number }, lineSize: number): LineValidation {
  const total  = sel.length
  const warnings: string[] = []
  let overfill = total > lineSize

  if (total !== lineSize) {
    const delta = total - lineSize
    warnings.push(delta > 0 ? `${delta} too many` : `${-delta} short`)
  }

  if (mode === 'mixed') {
    const m = sel.filter(p => p.gender === 'M').length
    const f = sel.filter(p => p.gender === 'F').length
    if (m !== ratio.M) warnings.push(`MMP ${m}/${ratio.M}`)
    if (f !== ratio.F) warnings.push(`FMP ${f}/${ratio.F}`)
    if (m > ratio.M || f > ratio.F) overfill = true
  }

  return { ok: warnings.length === 0, overfill, warnings }
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
  lineSize: number
  onAddPlayer: (name: string, gender: 'M' | 'F', jerseyNumber?: number) => void
}

const chipColor = (count: number, t: number) =>
  count > t ? 'var(--color-danger)'
    : count === t ? 'var(--color-success)'
    : count > 0 ? 'var(--color-warn)'
    : 'var(--color-muted)'

const byFirstName = (a: Player, b: Player) => firstNameKey(a.name).localeCompare(firstNameKey(b.name))

function TeamPanel({
  players, selected, color, onToggle, onSetAll,
  gameMode, targetM, targetF, lineSize, onAddPlayer,
}: TeamPanelProps) {
  const total  = selected.length
  const countM = selected.filter(p => p.gender === 'M').length
  const countF = selected.filter(p => p.gender === 'F').length
  const allSelected = players.length > 0 && total === players.length
  const isOn = (p: Player) => !!selected.find(s => s.id === p.id)

  const allButton = (
    <button
      type="button"
      onClick={() => onSetAll(allSelected ? [] : players)}
      className="text-xs font-mono uppercase tracking-widest px-2.5 h-7 rounded border cursor-pointer transition-colors"
      style={{ color: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
      title={allSelected ? 'Deselect all' : 'Select all'}
    >
      {allSelected ? 'None' : 'All'}
    </button>
  )

  // ── Mixed: two columns split by matching division, headed by their count
  //    chips. Compact tiles + no per-row gender letter (the column conveys it),
  //    so a big roster (26 for Nats) fits on one screen.
  if (gameMode === 'mixed') {
    const females = players.filter(p => p.gender === 'F').sort(byFirstName)
    const males   = players.filter(p => p.gender === 'M').sort(byFirstName)
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
          {allButton}
          <span className="text-[10px] font-mono tracking-wide ml-auto" style={{ color: 'var(--color-dim)' }} title="FMP = Female Matching Player · MMP = Male Matching Player">
            FMP = Female · MMP = Male matching
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 items-start">
          <GenderColumn
            heading={<Chip color={chipColor(countF, targetF)}>FMP {countF}/{targetF}</Chip>}
            players={females} color={color} isOn={isOn} onToggle={onToggle}
            addRow={<AddPlayerRow color={color} onAdd={onAddPlayer} fixedGender="F" />}
          />
          <GenderColumn
            heading={<Chip color={chipColor(countM, targetM)}>MMP {countM}/{targetM}</Chip>}
            players={males} color={color} isOn={isOn} onToggle={onToggle}
            addRow={<AddPlayerRow color={color} onAdd={onAddPlayer} fixedGender="M" />}
          />
        </div>
      </div>
    )
  }

  // ── Open: single column, no gender split.
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        {allButton}
        <Chip color={chipColor(total, lineSize)}>{total}/{lineSize}</Chip>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {[...players].sort(byFirstName).map(p => (
          <PlayerTile key={p.id} player={p} on={isOn(p)} color={color} onToggle={onToggle} />
        ))}
        <AddPlayerRow color={color} onAdd={onAddPlayer} />
      </div>
    </div>
  )
}

function GenderColumn({
  heading, players, color, isOn, onToggle, addRow,
}: {
  heading:  React.ReactNode
  players:  Player[]
  color:    string
  isOn:     (p: Player) => boolean
  onToggle: (p: Player) => void
  addRow:   React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex justify-center pb-0.5">{heading}</div>
      {players.map(p => (
        <PlayerTile key={p.id} player={p} on={isOn(p)} color={color} onToggle={onToggle} />
      ))}
      {addRow}
    </div>
  )
}

function PlayerTile({
  player, on, color, onToggle,
}: {
  player:   Player
  on:       boolean
  color:    string
  onToggle: (p: Player) => void
}) {
  return (
    <button
      onClick={() => onToggle(player)}
      className="flex items-center gap-2 px-2.5 rounded-lg border cursor-pointer transition-all min-w-0"
      style={{
        background:  on ? `${color}18` : 'var(--color-surf-2)',
        borderColor: on ? `${color}55` : 'var(--color-border)',
        height: 44,
      }}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs border transition-all"
        style={{
          background:  on ? color : 'transparent',
          borderColor: on ? color : 'var(--color-dim)',
          color:       on ? inkOn(color) : 'var(--color-dim)',
        }}
      >
        {on && <CheckIcon size={13} />}
      </span>
      <span
        className="text-base flex-1 text-left truncate"
        style={{
          fontWeight: on ? 600 : 400,
          color: on ? 'var(--color-content)' : 'var(--color-muted)',
        }}
      >
        {player.name}
        {player.jerseyNumber !== undefined && (
          <span className="font-mono ml-1.5 text-sm" style={{ color: 'var(--color-dim)' }}>
            #{player.jerseyNumber}
          </span>
        )}
      </span>
    </button>
  )
}

// In the mixed two-column layout each column is a fixed division, so the
// add-player form takes a `fixedGender` and hides the selector. The open
// single-column layout passes no `fixedGender` and shows the M/F selector.
function AddPlayerRow({ color, onAdd, fixedGender }: {
  color:       string
  onAdd:       (name: string, gender: 'M' | 'F', jersey?: number) => void
  fixedGender?: 'M' | 'F'
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'M' | 'F'>(fixedGender ?? 'M')
  const [jersey, setJersey] = useState('')

  const reset = () => { setName(''); setJersey(''); setGender(fixedGender ?? 'M'); setOpen(false) }
  const submit = () => {
    const n = name.trim()
    if (!n) return
    const j = jersey === '' ? undefined : Number(jersey)
    onAdd(n, fixedGender ?? gender, j)
    reset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 rounded-lg border border-dashed cursor-pointer transition-colors flex items-center justify-center"
        style={{ color, borderColor: `${color}55`, background: `${color}0a`, height: 44 }}
        title="Add a new player to this team"
      >
        <span className="text-sm font-semibold">+ Add</span>
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
        {!fixedGender && (
          <select
            value={gender}
            onChange={e => setGender(e.target.value as 'M' | 'F')}
            className="h-9 px-2 rounded-md border text-sm font-mono text-content cursor-pointer"
            style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border-2)' }}
            title="MMP = Male Matching Player · FMP = Female Matching Player"
          >
            <option value="M">MMP</option>
            <option value="F">FMP</option>
          </select>
        )}
        <input
          type="number"
          value={jersey}
          onChange={e => setJersey(e.target.value)}
          placeholder="#"
          className="w-14 h-9 px-2 rounded-md border text-sm font-mono text-center text-content"
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
