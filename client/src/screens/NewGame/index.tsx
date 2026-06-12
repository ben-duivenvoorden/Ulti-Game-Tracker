import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Label } from '@/components/ui/Label'
import { Section, TextField, Stepper } from '@/components/ui/form'
import { ScreenHeader } from '@/components/ScreenHeader'
import { PromptSheet } from '@/components/PromptSheet'
import { useGameActions, useTeamsState } from '@/core/selectors'
import type { GlobalTeamId } from '@/core/teams/types'
import { suggestShortName } from '@/core/teams/shortName'

interface NewGameFormProps {
  onCreated: (newGameId: number) => void
  onCancel:  () => void
}

const DEFAULT_TEAM_COLOR = '#1f4788'

export default function NewGameForm({ onCreated, onCancel }: NewGameFormProps) {
  const teamsState = useTeamsState()
  const actions    = useGameActions()

  const [name, setName] = useState('')
  const [scheduledTime, setScheduledTime] = useState('12:00')
  const [teamA, setTeamA] = useState<GlobalTeamId | null>(null)
  const [teamB, setTeamB] = useState<GlobalTeamId | null>(null)
  const [halfTimeAt, setHalfTimeAt] = useState(8)
  const [scoreCapAt, setScoreCapAt] = useState(15)
  // Which slot triggered the new-team prompt (null = closed).
  const [createSlot, setCreateSlot] = useState<'A' | 'B' | null>(null)

  const canSave = name.trim().length > 0 && teamA !== null && teamB !== null && teamA !== teamB

  const handleSave = () => {
    if (!canSave || teamA === null || teamB === null) return
    const gameId = actions.addScheduledGame({
      name:          name.trim(),
      scheduledTime,
      teamAGlobalId: teamA,
      teamBGlobalId: teamB,
      halfTimeAt,
      scoreCapAt,
    })
    onCreated(gameId)
  }

  // Create-team from the picker — the "+ Add new team…" choice opens an in-app
  // prompt (remembering which slot asked); the fresh id drops into that slot.
  const submitNewTeam = (proposed: string) => {
    const id = actions.addTeam(proposed, suggestShortName(proposed), DEFAULT_TEAM_COLOR)
    if (createSlot === 'A') setTeamA(id)
    else if (createSlot === 'B') setTeamB(id)
    setCreateSlot(null)
  }

  return (
    <div className="h-full flex flex-col bg-bg text-content relative">
      <ScreenHeader
        onBack={onCancel}
        backTitle="Cancel"
        center={<Label block>NEW GAME</Label>}
        right={<Btn variant="primary" size="md" disabled={!canSave} onClick={handleSave}>Save</Btn>}
      />

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
          onCreate={() => setCreateSlot('A')}
          excludeId={teamB}
          teams={teamsState.teams}
        />
        <TeamPicker
          slot="B"
          value={teamB}
          onChange={setTeamB}
          onCreate={() => setCreateSlot('B')}
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

      <PromptSheet
        open={createSlot !== null}
        title="New team"
        label="Team name"
        placeholder="e.g. New York Empire"
        confirmLabel="Add"
        onSubmit={submitNewTeam}
        onCancel={() => setCreateSlot(null)}
      />
    </div>
  )
}

// ─── Team picker ─────────────────────────────────────────────────────────────

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
