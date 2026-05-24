import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { useGameStore } from '@/core/store'
import { useTeamsState } from '@/core/selectors'
import type { GlobalTeam, GlobalPlayer, GlobalTeamId } from '@/core/teams/types'

const DEFAULT_NEW_TEAM_COLOR = '#1f4788'

type View =
  | { kind: 'list' }
  | { kind: 'new-team' }
  | { kind: 'team'; id: GlobalTeamId }

export default function TeamsManager() {
  const teamsState        = useTeamsState()
  const closeTeamsManager = useGameStore(s => s.closeTeamsManager)
  const addTeam           = useGameStore(s => s.addTeam)
  const editTeam          = useGameStore(s => s.editTeam)
  const archiveTeam       = useGameStore(s => s.archiveTeam)
  const addPlayer         = useGameStore(s => s.addPlayer)
  const editPlayer        = useGameStore(s => s.editPlayer)
  const removePlayer      = useGameStore(s => s.removePlayer)
  const resetAllData      = useGameStore(s => s.resetAllData)

  const [view, setView] = useState<View>({ kind: 'list' })

  // ─── New team push view ───────────────────────────────────────────────────
  if (view.kind === 'new-team') {
    return (
      <NewTeamView
        onCreate={(name, short, color) => {
          const id = addTeam(name, short, color)
          setView({ kind: 'team', id })
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    )
  }

  // ─── Team detail push view ────────────────────────────────────────────────
  if (view.kind === 'team') {
    const team = teamsState.teamsById.get(view.id)
    if (!team) { setView({ kind: 'list' }); return null }
    return (
      <TeamDetailView
        team={team}
        roster={teamsState.rosterByTeam.get(team.id) ?? []}
        onBack={() => setView({ kind: 'list' })}
        onEditTeam={(patch) => editTeam(team.id, patch)}
        onArchive={() => {
          if (window.confirm(`Archive ${team.name}? Historical games will still resolve their rosters.`)) {
            archiveTeam(team.id)
            setView({ kind: 'list' })
          }
        }}
        onAddPlayer={(p) => addPlayer(team.id, p.name, p.gender, p.extras)}
        onEditPlayer={editPlayer}
        onRemovePlayer={removePlayer}
      />
    )
  }

  // ─── List view (default) ──────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <Label block className="mb-1">TEAMS MANAGER</Label>
          <div className="text-base font-bold">Roster</div>
        </div>
        <Btn variant="primary" size="sm" onClick={closeTeamsManager}>Done</Btn>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => setView({ kind: 'new-team' })}
          className="w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors"
        >
          <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--color-success)' }}>+ New Team</div>
          <Label>Add to your roster</Label>
        </button>
        {teamsState.teams.map(t => {
          const count = teamsState.rosterByTeam.get(t.id)?.length ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setView({ kind: 'team', id: t.id })}
              className="w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors flex items-center gap-3"
            >
              <span
                className="flex-shrink-0 w-3 h-3 rounded-full"
                style={{ background: t.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-content truncate">{t.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Chip color={t.color}>{t.short}</Chip>
                  <Label>{count} {count === 1 ? 'player' : 'players'}</Label>
                </div>
              </div>
              <span style={{ color: 'var(--color-dim)' }}>›</span>
            </button>
          )
        })}
      </div>

      {/* Reset escape hatch at the bottom — destructive, kept far from the
          common path. */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border">
        <button
          onClick={() => {
            if (window.confirm('Reset all teams, players and scheduled games to the demo seed? Any in-progress session will be lost.')) {
              resetAllData()
            }
          }}
          className="text-[10px] font-mono tracking-widest uppercase cursor-pointer transition-colors hover:text-danger"
          style={{ color: 'var(--color-muted)' }}
        >
          ⚠ Reset all data
        </button>
      </div>
    </div>
  )
}

// ─── New team view ───────────────────────────────────────────────────────────

function NewTeamView({ onCreate, onCancel }: {
  onCreate: (name: string, short: string, color: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [short, setShort] = useState('')
  const [color, setColor] = useState(DEFAULT_NEW_TEAM_COLOR)
  const canSave = name.trim().length > 0 && short.trim().length > 0

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <div className="flex-shrink-0 flex items-center justify-between px-3 h-12 border-b border-border">
        <button
          onClick={onCancel}
          className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
        >
          ←
        </button>
        <Label>NEW TEAM</Label>
        <Btn variant="primary" size="sm" disabled={!canSave}
          onClick={() => onCreate(name.trim(), short.trim(), color)}>
          Save
        </Btn>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <TextField label="Name"  value={name}  onChange={setName}  placeholder="Empire" autoFocus />
        <TextField label="Short" value={short} onChange={s => setShort(s.toUpperCase())} placeholder="NYE" />
        <ColorField label="Colour" value={color} onChange={setColor} />
      </div>
    </div>
  )
}

// ─── Team detail view ────────────────────────────────────────────────────────

function TeamDetailView({ team, roster, onBack, onEditTeam, onArchive, onAddPlayer, onEditPlayer, onRemovePlayer }: {
  team:           GlobalTeam
  roster:         GlobalPlayer[]
  onBack:         () => void
  onEditTeam:     (patch: { name?: string; short?: string; color?: string }) => void
  onArchive:      () => void
  onAddPlayer:    (p: { name: string; gender: 'M' | 'F'; extras?: { jerseyNumber?: number } }) => void
  onEditPlayer:   (id: number, patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null }) => void
  onRemovePlayer: (id: number) => void
}) {
  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <div className="flex-shrink-0 flex items-center justify-between px-3 h-12 border-b border-border">
        <button
          onClick={onBack}
          className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none"
        >
          ←
        </button>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
          <Chip color={team.color}>{team.short}</Chip>
          <span className="text-sm font-bold truncate">{team.name}</span>
        </div>
        <Btn variant="ghost" size="sm" onClick={onArchive}>Archive</Btn>
      </div>

      {/* Team identity editor */}
      <div className="flex-shrink-0 p-3 flex flex-col gap-2 border-b border-border">
        <TextField label="Name"  value={team.name}  onChange={v => onEditTeam({ name: v })} />
        <div className="flex gap-2">
          <div className="flex-1">
            <TextField label="Short" value={team.short} onChange={v => onEditTeam({ short: v.toUpperCase().slice(0, 4) })} />
          </div>
          <ColorField label="Colour" value={team.color} onChange={v => onEditTeam({ color: v })} />
        </div>
      </div>

      {/* Roster */}
      <div className="flex-1 overflow-y-auto p-3">
        <Label className="mb-2 block">PLAYERS ({roster.length})</Label>
        <div className="flex flex-col gap-1.5">
          {roster.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              onEdit={patch => onEditPlayer(p.id, patch)}
              onRemove={() => {
                if (window.confirm(`Remove ${p.name}? Existing games still resolve their roster by id.`)) {
                  onRemovePlayer(p.id)
                }
              }}
            />
          ))}
        </div>
        <div className="mt-3">
          <AddPlayerInline onAdd={onAddPlayer} />
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ player, onEdit, onRemove }: {
  player:   GlobalPlayer
  onEdit:   (patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null }) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md border"
      style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border)' }}
    >
      <select
        value={player.gender}
        onChange={e => onEdit({ gender: e.target.value as 'M' | 'F' })}
        className="h-9 px-2 rounded-md border text-sm font-mono text-content cursor-pointer flex-shrink-0"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      >
        <option value="M">M</option>
        <option value="F">F</option>
      </select>
      <input
        type="text"
        value={player.name}
        onChange={e => onEdit({ name: e.target.value })}
        className="flex-1 min-w-0 h-9 px-3 rounded-md border text-sm text-content"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      />
      <input
        type="number"
        value={player.jerseyNumber ?? ''}
        onChange={e => {
          const raw = e.target.value
          onEdit({ jerseyNumber: raw === '' ? null : Number(raw) })
        }}
        placeholder="#"
        className="w-14 h-9 px-2 rounded-md border text-sm font-mono text-center text-content flex-shrink-0"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      />
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-8 h-9 cursor-pointer rounded-md hover:bg-surf-2"
        style={{ color: 'var(--color-muted)' }}
        title="Remove player"
      >
        ✕
      </button>
    </div>
  )
}

function AddPlayerInline({ onAdd }: {
  onAdd: (p: { name: string; gender: 'M' | 'F'; extras?: { jerseyNumber?: number } }) => void
}) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'M' | 'F'>('M')
  const [jersey, setJersey] = useState('')
  const canAdd = name.trim().length > 0

  const submit = () => {
    if (!canAdd) return
    const extras: { jerseyNumber?: number } = jersey === '' ? {} : { jerseyNumber: Number(jersey) }
    onAdd({ name: name.trim(), gender, extras })
    setName('')
    setJersey('')
  }

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-md border border-dashed"
      style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border-2)' }}
    >
      <select
        value={gender}
        onChange={e => setGender(e.target.value as 'M' | 'F')}
        className="h-9 px-2 rounded-md border text-sm font-mono text-content cursor-pointer flex-shrink-0"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      >
        <option value="M">M</option>
        <option value="F">F</option>
      </select>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="+ Add player"
        className="flex-1 min-w-0 h-9 px-3 rounded-md border text-sm text-content"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      />
      <input
        type="number"
        value={jersey}
        onChange={e => setJersey(e.target.value)}
        placeholder="#"
        className="w-14 h-9 px-2 rounded-md border text-sm font-mono text-center text-content flex-shrink-0"
        style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      />
      <Btn variant="primary" size="sm" disabled={!canAdd} onClick={submit}>Add</Btn>
    </div>
  )
}

// ─── Shared form bits ────────────────────────────────────────────────────────

function TextField({ label, value, onChange, placeholder, autoFocus }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
        {label.toUpperCase()}
      </span>
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

function ColorField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 h-10 rounded-md border"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}>
      <span className="text-sm font-semibold text-content">{label}</span>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-7 rounded cursor-pointer"
      />
    </label>
  )
}
