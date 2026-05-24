import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Label } from '@/components/ui/Label'
import { useGameStore } from '@/core/store'
import { useTeamsState } from '@/core/selectors'
import type { GlobalTeamId } from '@/core/teams/types'

interface NewGameFormProps {
  onCreated: (newGameId: number) => void
  onCancel:  () => void
}

const DEFAULT_TEAM_COLOR = '#1f4788'

export default function NewGameForm({ onCreated, onCancel }: NewGameFormProps) {
  const teamsState     = useTeamsState()
  const addScheduled   = useGameStore(s => s.addScheduledGame)
  const addTeam        = useGameStore(s => s.addTeam)

  const [name, setName] = useState('')
  const [scheduledTime, setScheduledTime] = useState('12:00')
  const [teamA, setTeamA] = useState<GlobalTeamId | null>(null)
  const [teamB, setTeamB] = useState<GlobalTeamId | null>(null)
  const [halfTimeAt, setHalfTimeAt] = useState(8)
  const [scoreCapAt, setScoreCapAt] = useState(15)

  const canSave = name.trim().length > 0 && teamA !== null && teamB !== null && teamA !== teamB

  const handleSave = () => {
    if (!canSave || teamA === null || teamB === null) return
    const gameId = addScheduled({
      name:          name.trim(),
      scheduledTime,
      teamAGlobalId: teamA,
      teamBGlobalId: teamB,
      halfTimeAt,
      scoreCapAt,
    })
    onCreated(gameId)
  }

  // Create-team inline from the picker. The fresh id flows straight back into
  // the picker that asked for it.
  const handleCreateTeam = (slot: 'A' | 'B'): GlobalTeamId | null => {
    const proposed = window.prompt('Team name:')
    if (!proposed || !proposed.trim()) return null
    const short = proposed.trim().slice(0, 3).toUpperCase()
    const id = addTeam(proposed.trim(), short, DEFAULT_TEAM_COLOR)
    if (slot === 'A') setTeamA(id)
    else              setTeamB(id)
    return id
  }

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 h-12"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onCancel}
          className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
          title="Cancel"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <Label block>NEW GAME</Label>
        </div>
        <Btn variant="primary" size="sm" disabled={!canSave} onClick={handleSave}>Save</Btn>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
      <Section title="DETAILS">
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Empire vs Breeze"
          autoFocus
        />
        <TextField
          label="Scheduled time"
          value={scheduledTime}
          onChange={setScheduledTime}
          placeholder="09:00"
        />
      </Section>

      <Section title="TEAMS">
        <TeamPicker
          slot="A"
          value={teamA}
          onChange={setTeamA}
          onCreate={() => handleCreateTeam('A')}
          excludeId={teamB}
          teams={teamsState.teams}
        />
        <TeamPicker
          slot="B"
          value={teamB}
          onChange={setTeamB}
          onCreate={() => handleCreateTeam('B')}
          excludeId={teamA}
          teams={teamsState.teams}
        />
        {teamA !== null && teamA === teamB && (
          <div className="text-xs" style={{ color: 'var(--color-warn)' }}>Team A and Team B must differ.</div>
        )}
      </Section>

      <Section title="RULES">
        <Stepper label="Half-time at"  value={halfTimeAt} onChange={setHalfTimeAt} min={1}  max={20} />
        <Stepper label="Score cap"     value={scoreCapAt} onChange={setScoreCapAt} min={1}  max={30} />
      </Section>
      </div>
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-3 flex flex-col gap-2"
      style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border)' }}
    >
      <Label className="text-[9px]">{title}</Label>
      {children}
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, autoFocus }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>{label.toUpperCase()}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-10 px-3 rounded-md border text-sm font-medium text-content"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      />
    </label>
  )
}

function Stepper({ label, value, min, max, onChange }: {
  label: string
  value: number
  min:   number
  max:   number
  onChange: (v: number) => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 h-10 rounded-md border"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
    >
      <span className="text-sm font-semibold text-content">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 rounded-md border text-base font-bold cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default"
          style={{
            background:  'var(--color-surf-3)',
            borderColor: 'var(--color-border-2)',
            color:       'var(--color-content)',
          }}
        >−</button>
        <span className="w-6 text-center text-base font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 rounded-md border text-base font-bold cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default"
          style={{
            background:  'var(--color-surf-3)',
            borderColor: 'var(--color-border-2)',
            color:       'var(--color-content)',
          }}
        >+</button>
      </div>
    </div>
  )
}

function TeamPicker({ slot, value, onChange, onCreate, excludeId, teams }: {
  slot: 'A' | 'B'
  value: GlobalTeamId | null
  onChange: (v: GlobalTeamId) => void
  onCreate: () => void
  excludeId: GlobalTeamId | null
  teams: { id: GlobalTeamId; name: string; short: string; color: string }[]
}) {
  // Native <select> for keyboard + screen-reader friendliness; the `+ Add new
  // team` choice is represented by a sentinel and dispatched on change.
  const NEW = -1
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
        TEAM {slot}
      </span>
      <select
        value={value ?? ''}
        onChange={e => {
          const raw = e.target.value
          if (raw === '') return
          const next = Number(raw)
          if (next === NEW) {
            onCreate()
            return
          }
          onChange(next)
        }}
        className="h-10 px-3 rounded-md border text-sm font-medium text-content cursor-pointer"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      >
        <option value="" disabled>Choose team…</option>
        {teams.filter(t => t.id !== excludeId).map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
        <option value={NEW}>+ Add new team…</option>
      </select>
    </label>
  )
}
