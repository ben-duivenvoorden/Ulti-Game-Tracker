import { useEffect, useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { Section, Stepper } from '@/components/ui/form'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useEditingCompetition, useGameActions } from '@/core/selectors'
import type { RecordingOptions } from '@/core/types'
import type { Competition, CompetitionOptionKey } from '@/core/games/types'

// ─── Competition settings ─────────────────────────────────────────────────────
// The competition level owns rule defaults + enforcement. Every governed
// option carries a three-way policy:
//   —        the competition says nothing; the recorder's own setting stands
//   Default  games start with this value; the scorer may still change it
//   Locked   enforced — greyed out in GameSettings while a game is live
// Each change appends a competition-edit event with the full defaults/locked
// state (append-only log; the editor always writes complete state).

type Policy = 'unset' | 'default' | 'locked'

const TOGGLES: Array<{ key: CompetitionOptionKey & keyof RecordingOptions; label: string; hint: string; section: 'wfdf' | 'mods' }> = [
  { key: 'passes',    label: 'Passes',              hint: 'Record each receive',            section: 'wfdf' },
  { key: 'brick',     label: 'Brick',               hint: 'Pull lands OB / fouls',          section: 'wfdf' },
  { key: 'foul',      label: 'Foul',                hint: 'Foul calls during play',         section: 'wfdf' },
  { key: 'pick',      label: 'Pick',                hint: 'Pick violations',                section: 'wfdf' },
  { key: 'stall',     label: 'Stall',               hint: 'Stall as turnover',              section: 'wfdf' },
  { key: 'abba',      label: 'ABBA Ratio (Rule A)', hint: 'Per-point gender-ratio advice',  section: 'wfdf' },
  { key: 'pullBonus', label: 'Pull Distance Bonus', hint: 'House rule — end-zone pulls',    section: 'mods' },
]

const LINE_KEYS: CompetitionOptionKey[] = ['gameMode', 'lineRatio', 'lineSize']

function policyOf(comp: Competition, key: CompetitionOptionKey): Policy {
  if (!(key in comp.defaults)) return 'unset'
  return comp.locked.includes(key) ? 'locked' : 'default'
}

export default function CompetitionSettings() {
  const { closeCompetitionSettings, editCompetition } = useGameActions()
  const comp = useEditingCompetition()

  // Dangling id (e.g. persisted screen without state) — nothing to edit.
  useEffect(() => {
    if (!comp) closeCompetitionSettings()
  }, [comp, closeCompetitionSettings])
  if (!comp) return null

  /** Write the full next defaults/locked state as one competition-edit. */
  const write = (defaults: Partial<RecordingOptions>, locked: CompetitionOptionKey[]) =>
    editCompetition(comp.id, { defaults, locked })

  const setPolicy = (keys: CompetitionOptionKey[], next: Policy, fallback: Partial<RecordingOptions>) => {
    const defaults = { ...comp.defaults }
    let locked = comp.locked.filter(k => !keys.includes(k))
    for (const key of keys) {
      if (next === 'unset') {
        delete defaults[key]
      } else {
        if (!(key in defaults)) Object.assign(defaults, { [key]: fallback[key] })
        if (next === 'locked') locked = [...locked, key]
      }
    }
    write(defaults, locked)
  }

  const setValue = <K extends keyof RecordingOptions>(key: K, value: RecordingOptions[K]) =>
    write({ ...comp.defaults, [key]: value }, comp.locked)

  const linePolicy = policyOf(comp, 'gameMode')
  const lineRatio  = comp.defaults.lineRatio ?? { M: 4, F: 3 }
  const gameMode   = comp.defaults.gameMode ?? 'mixed'
  const lineSize   = comp.defaults.lineSize ?? lineRatio.M + lineRatio.F

  const setLineValues = (patch: Partial<RecordingOptions>) =>
    write({ ...comp.defaults, ...patch }, comp.locked)

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <ScreenHeader
        onBack={closeCompetitionSettings}
        backTitle="Back"
        kicker="COMPETITION"
        title={<span className="text-sm">{comp.name}</span>}
        right={<Btn variant="primary" size="md" onClick={closeCompetitionSettings}>Done</Btn>}
      />

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        <Section title="NAME">
          <NameField
            key={comp.id}
            initial={comp.name}
            onCommit={name => { if (name.trim().length > 0 && name.trim() !== comp.name) editCompetition(comp.id, { name: name.trim() }) }}
          />
        </Section>

        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Per rule: <b>—</b> leaves it to the scorer · <b>DEF</b> is the starting value
          (scorer can change it per game) · <b>LOCK</b> enforces it while one of this
          competition&apos;s games is being recorded.
        </div>

        <Section title="LINE COMPOSITION">
          <PolicyPicker
            value={linePolicy}
            onChange={p => setPolicy(LINE_KEYS, p, { gameMode: 'mixed', lineRatio: { M: 4, F: 3 }, lineSize: 7 })}
          />
          {linePolicy !== 'unset' && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex gap-2">
                <ModeButton
                  selected={gameMode === 'mixed'}
                  onClick={() => setLineValues({ gameMode: 'mixed' })}
                >Mixed</ModeButton>
                <ModeButton
                  selected={gameMode === 'open'}
                  onClick={() => setLineValues({ gameMode: 'open' })}
                >Open</ModeButton>
              </div>
              {gameMode === 'open' ? (
                <Stepper
                  label="Players per line"
                  value={lineSize}
                  onChange={v => setLineValues({ lineSize: v })}
                  min={1}
                  max={15}
                />
              ) : (
                <>
                  <Stepper
                    label="MMP (Male Matching)"
                    value={lineRatio.M}
                    onChange={v => setLineValues({ lineRatio: { ...lineRatio, M: v }, lineSize: v + lineRatio.F })}
                    min={0}
                    max={15}
                  />
                  <Stepper
                    label="FMP (Female Matching)"
                    value={lineRatio.F}
                    onChange={v => setLineValues({ lineRatio: { ...lineRatio, F: v }, lineSize: lineRatio.M + v })}
                    min={0}
                    max={15}
                  />
                </>
              )}
            </div>
          )}
        </Section>

        <Section title="WFDF">
          <div className="flex flex-col gap-2">
            {TOGGLES.filter(t => t.section === 'wfdf').map(t => (
              <PolicyToggle
                key={t.key}
                label={t.label}
                hint={t.hint}
                policy={policyOf(comp, t.key)}
                checked={comp.defaults[t.key] === true}
                onPolicy={p => setPolicy([t.key], p, { [t.key]: false })}
                onValue={v => setValue(t.key, v)}
              />
            ))}
          </div>
        </Section>

        <Section title="MODIFICATIONS">
          <div className="flex flex-col gap-2">
            {TOGGLES.filter(t => t.section === 'mods').map(t => (
              <PolicyToggle
                key={t.key}
                label={t.label}
                hint={t.hint}
                policy={policyOf(comp, t.key)}
                checked={comp.defaults[t.key] === true}
                onPolicy={p => setPolicy([t.key], p, { [t.key]: false })}
                onValue={v => setValue(t.key, v)}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── Building blocks ────────────────────────────────────────────────────────────

/** Name editor — commits on blur so the append-only log gets one
 *  competition-edit per rename, not one per keystroke. */
function NameField({ initial, onCommit }: { initial: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(initial)
  return (
    <input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      className="w-full h-10 px-3 rounded-md border text-sm font-medium text-content"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
    />
  )
}

const POLICIES: Array<{ value: Policy; label: string }> = [
  { value: 'unset',   label: '—' },
  { value: 'default', label: 'DEF' },
  { value: 'locked',  label: 'LOCK' },
]

function PolicyPicker({ value, onChange }: { value: Policy; onChange: (p: Policy) => void }) {
  return (
    <div className="flex rounded-md border overflow-hidden flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
      {POLICIES.map(p => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className="px-2.5 h-7 text-[10px] font-bold font-mono tracking-wide cursor-pointer"
          style={{
            background: value === p.value
              ? (p.value === 'locked' ? 'var(--color-warn)' : 'var(--color-team-a)')
              : 'transparent',
            color: value === p.value
              ? (p.value === 'locked' ? '#111' : '#fff')
              : 'var(--color-muted)',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function PolicyToggle({ label, hint, policy, checked, onPolicy, onValue }: {
  label:    string
  hint:     string
  policy:   Policy
  checked:  boolean
  onPolicy: (p: Policy) => void
  onValue:  (v: boolean) => void
}) {
  const governed = policy !== 'unset'
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border"
      style={{
        background:  governed ? 'var(--color-surf-2)' : 'transparent',
        borderColor: governed ? 'var(--color-border-2)' : 'var(--color-border)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-content leading-none mb-0.5">{label}</div>
        <div className="text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>{hint}</div>
      </div>
      {governed && (
        <button
          type="button"
          onClick={() => onValue(!checked)}
          className="flex-shrink-0 cursor-pointer"
          title={checked ? 'On' : 'Off'}
        >
          <Toggle checked={checked} />
        </button>
      )}
      <PolicyPicker value={policy} onChange={onPolicy} />
    </div>
  )
}

function ModeButton({ children, selected, onClick }: { children: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 h-10 rounded-md border text-sm font-semibold transition-colors cursor-pointer"
      style={{
        background:  selected ? 'var(--color-team-a)' : 'transparent',
        borderColor: selected ? 'transparent' : 'var(--color-border)',
        color:       selected ? '#fff' : 'var(--color-muted)',
      }}
    >
      {children}
    </button>
  )
}

function Toggle({ checked }: { checked: boolean }) {
  return (
    <div
      className="flex-shrink-0 w-9 h-5 rounded-full relative transition-colors duration-200"
      style={{ background: checked ? 'var(--color-success)' : 'var(--color-surf-2)', border: '1px solid var(--color-border-2)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
        style={{
          background: checked ? '#fff' : 'var(--color-dim)',
          transform: checked ? 'translateX(16px)' : 'translateX(2px)',
        }}
      />
    </div>
  )
}
