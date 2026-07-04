import { useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Label } from '@/components/ui/Label'
import { CloseIcon, WarnIcon } from '@/components/ui/Icons'
import { TextField, ColorField, GenderSelect } from '@/components/ui/form'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { useGameActions, useTeamsState } from '@/core/selectors'
import type { GlobalTeam, GlobalPlayer, GlobalTeamId } from '@/core/teams/types'
import { suggestShortName, SHORT_NAME_MAX } from '@/core/teams/shortName'

const DEFAULT_NEW_TEAM_COLOR = '#1f4788'

type View =
  | { kind: 'list' }
  | { kind: 'new-team' }
  | { kind: 'team'; id: GlobalTeamId }

export default function TeamsManager() {
  const teamsState = useTeamsState()
  const { closeTeamsManager, addTeam, editTeam, archiveTeam,
          addPlayer, editPlayer, removePlayer, resetAllData } = useGameActions()

  const [view, setView] = useState<View>({ kind: 'list' })
  const [resetConfirm, setResetConfirm] = useState(false)

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
        onArchive={() => { archiveTeam(team.id); setView({ kind: 'list' }) }}
        onAddPlayer={(p) => addPlayer(team.id, p.name, p.gender, p.extras)}
        onEditPlayer={editPlayer}
        onRemovePlayer={removePlayer}
      />
    )
  }

  // ─── List view (default) ──────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-bg text-content relative">
      <ScreenHeader
        kicker="TEAMS MANAGER"
        title="Roster"
        right={<Btn variant="primary" size="md" onClick={closeTeamsManager}>Done</Btn>}
      />

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => setView({ kind: 'new-team' })}
          className="w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors"
        >
          <div className="text-lg font-semibold mb-0.5" style={{ color: 'var(--color-success)' }}>+ New Team</div>
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
                className="flex-shrink-0 w-4 h-4 rounded-full"
                style={{ background: t.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-content truncate">{t.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Chip color={t.color} variant="solid">{t.short}</Chip>
                  <Label>{count} {count === 1 ? 'player' : 'players'}</Label>
                </div>
              </div>
              <span className="text-xl" style={{ color: 'var(--color-dim)' }}>›</span>
            </button>
          )
        })}
      </div>

      {/* Reset escape hatch at the bottom — destructive, kept far from the
          common path. */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border">
        <button
          onClick={() => setResetConfirm(true)}
          className="text-[10px] font-mono tracking-widest uppercase cursor-pointer transition-colors hover:text-danger flex items-center gap-1.5"
          style={{ color: 'var(--color-muted)' }}
        >
          <WarnIcon size={13} /> Reset all data
        </button>
      </div>

      <ConfirmSheet
        open={resetConfirm}
        title="Reset all data?"
        message="Reset all teams, players and scheduled games to the demo seed? Any in-progress session will be lost."
        confirmLabel="Reset"
        danger
        onConfirm={() => { resetAllData(); setResetConfirm(false) }}
        onCancel={() => setResetConfirm(false)}
      />
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
  const [shortDirty, setShortDirty] = useState(false)
  const [color, setColor] = useState(DEFAULT_NEW_TEAM_COLOR)

  // Auto-suggest the short until the user manually edits it. After they
  // touch the field, their input takes over and we stop suggesting.
  const onNameChange = (v: string) => {
    setName(v)
    if (!shortDirty) setShort(suggestShortName(v))
  }
  const onShortChange = (v: string) => {
    setShortDirty(true)
    setShort(v.toUpperCase().slice(0, SHORT_NAME_MAX))
  }
  const canSave = name.trim().length > 0 && short.trim().length > 0

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <ScreenHeader
        onBack={onCancel}
        center={<Label>NEW TEAM</Label>}
        right={
          <Btn variant="primary" size="md" disabled={!canSave}
            onClick={() => onCreate(name.trim(), short.trim(), color)}>
            Save
          </Btn>
        }
      />
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <TextField label="Name"  value={name}  onChange={onNameChange}  placeholder="Lounge Lizards Eastside" autoFocus />
        <TextField label={`Short (max ${SHORT_NAME_MAX})`} value={short} onChange={onShortChange} placeholder="LLE" />
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
  onEditPlayer:   (id: number, patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null; spokenAliases?: string[] }) => void
  onRemovePlayer: (id: number) => void
}) {
  const [confirm, setConfirm] = useState<
    { title: string; message?: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void } | null
  >(null)
  return (
    <div className="h-full flex flex-col bg-bg text-content relative">
      <ScreenHeader
        onBack={onBack}
        center={
          <>
            <Chip color={team.color} variant="solid">{team.short}</Chip>
            <span className="text-sm font-bold truncate">{team.name}</span>
          </>
        }
        right={
          <Btn
            variant="ghost"
            size="md"
            onClick={() => setConfirm({
              title: `Archive ${team.name}?`,
              message: 'Historical games will still resolve their rosters.',
              confirmLabel: 'Archive',
              onConfirm: onArchive,
            })}
          >
            Archive
          </Btn>
        }
      />

      {/* Team identity editor */}
      <div className="flex-shrink-0 p-3 flex flex-col gap-2 border-b border-border">
        <TextField label="Name"  value={team.name}  onChange={v => onEditTeam({ name: v })} />
        <div className="flex gap-2">
          <div className="flex-1">
            <TextField
              label={`Short (max ${SHORT_NAME_MAX})`}
              value={team.short}
              onChange={v => onEditTeam({ short: v.toUpperCase().slice(0, SHORT_NAME_MAX) })}
            />
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
              onRemove={() => setConfirm({
                title: `Remove ${p.name}?`,
                message: 'Existing games still resolve their roster by id.',
                danger: true,
                confirmLabel: 'Remove',
                onConfirm: () => onRemovePlayer(p.id),
              })}
            />
          ))}
        </div>
        <div className="mt-3">
          <AddPlayerInline onAdd={onAddPlayer} />
        </div>
      </div>

      <ConfirmSheet
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => { confirm?.onConfirm(); setConfirm(null) }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function PlayerRow({ player, onEdit, onRemove }: {
  player:   GlobalPlayer
  onEdit:   (patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null; spokenAliases?: string[] }) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-md border"
      style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-2">
        <GenderSelect value={player.gender} onChange={gender => onEdit({ gender })} />
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
          className="flex-shrink-0 w-8 h-9 cursor-pointer rounded-md hover:bg-surf-2 flex items-center justify-center"
          style={{ color: 'var(--color-muted)' }}
          title="Remove player"
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <AliasesInput aliases={player.spokenAliases} onCommit={spokenAliases => onEdit({ spokenAliases })} />
    </div>
  )
}

// Spoken aliases (nicknames) for voice matching. Local state while typing —
// commas / trailing spaces would fight a parse-on-keystroke controlled input —
// committed as one player-edit event on blur / Enter.
function AliasesInput({ aliases, onCommit }: {
  aliases:  string[]
  onCommit: (aliases: string[]) => void
}) {
  const [draft, setDraft] = useState(aliases.join(', '))
  const commit = () => {
    const next = draft.split(',').map(s => s.trim()).filter(s => s.length > 0)
    setDraft(next.join(', '))
    if (next.join(' ') !== aliases.join(' ')) onCommit(next)
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="Spoken aliases (voice) — e.g. Bennie, Beast"
      title="Nicknames the voice recogniser should accept for this player, comma-separated"
      className="w-full h-8 px-3 rounded-md border text-xs text-content"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
    />
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
      <GenderSelect value={gender} onChange={setGender} />
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

