import { useGameStore } from '@/core/store'
import { useRecordingOptions } from '@/core/selectors'
import { Label } from '@/components/ui/Label'
import { Btn } from '@/components/ui/Btn'

export default function GameSettings() {
  const closeGameSettings   = useGameStore(s => s.closeGameSettings)
  const updateRecordingOption = useGameStore(s => s.updateRecordingOption)
  const options = useRecordingOptions()

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      {/* Header — same h-16 (64 px) height as every screen. */}
      <div className="flex-shrink-0 h-16 border-b border-border flex items-center gap-3 px-4">
        <button
          onClick={closeGameSettings}
          className="text-muted hover:text-content transition-colors cursor-pointer text-lg leading-none flex-shrink-0"
          title="Back"
        >
          ←
        </button>
        <div className="flex-1">
          <Label block className="mb-0.5">RECORDING SETTINGS</Label>
          <div className="text-sm font-bold leading-tight">Configure what events are tracked</div>
        </div>
        <Btn variant="primary" size="md" onClick={closeGameSettings}>Done</Btn>
      </div>

      {/* Settings body — single column for portrait */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        <Section title="GAME MODE & LINE COMPOSITION">
          <div className="flex gap-2">
            <ModeButton
              selected={options.gameMode === 'mixed'}
              onClick={() => updateRecordingOption('gameMode', 'mixed')}
            >Mixed</ModeButton>
            <ModeButton
              selected={options.gameMode === 'open'}
              onClick={() => updateRecordingOption('gameMode', 'open')}
            >Open</ModeButton>
          </div>
          {options.gameMode === 'open' ? (
            <CompactStepper
              label="Players per line"
              value={options.lineRatio.M + options.lineRatio.F}
              onChange={v => updateRecordingOption('lineRatio', { M: v, F: 0 })}
              min={1}
              max={9}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <CompactStepper
                label="Male Matching"
                value={options.lineRatio.M}
                onChange={v => updateRecordingOption('lineRatio', { ...options.lineRatio, M: v })}
                min={0}
                max={9}
              />
              <CompactStepper
                label="Female Matching"
                value={options.lineRatio.F}
                onChange={v => updateRecordingOption('lineRatio', { ...options.lineRatio, F: v })}
                min={0}
                max={9}
              />
            </div>
          )}
        </Section>

        <Section title="EVENTS">
          <div className="flex flex-col gap-2">
            <CompactToggle
              label="Passes"
              hint="Default player-tap action; records each receive"
              checked={options.passes}
              onChange={v => updateRecordingOption('passes', v)}
            />
            {options.passes && (
              <CompactStepper
                label="Pass arrows on screen"
                value={options.passArrowsShown}
                onChange={v => updateRecordingOption('passArrowsShown', v)}
                min={0}
                max={3}
              />
            )}
            <CompactToggle
              label="Pull Distance Bonus"
              hint="End-zone pulls"
              checked={options.pullBonus}
              onChange={v => updateRecordingOption('pullBonus', v)}
            />
            <CompactToggle
              label="Brick"
              hint="Pull lands OB / fouls"
              checked={options.brick}
              onChange={v => updateRecordingOption('brick', v)}
            />
            <CompactToggle
              label="Foul"
              hint="Foul calls during play"
              checked={options.foul}
              onChange={v => updateRecordingOption('foul', v)}
            />
            <CompactToggle
              label="Pick"
              hint="Pick violations"
              checked={options.pick}
              onChange={v => updateRecordingOption('pick', v)}
            />
            <CompactToggle
              label="Stall"
              hint="Stall as turnover"
              checked={options.stall}
              onChange={v => updateRecordingOption('stall', v)}
            />
          </div>
        </Section>
      </div>

    </div>
  )
}

// ── Building blocks ────────────────────────────────────────────────────────────

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-2 ${className}`}
      style={{ background: 'var(--color-surf)', borderColor: 'var(--color-border)' }}
    >
      <Label className="text-[9px]">{title}</Label>
      {children}
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

function CompactStepper({
  label, value, min, max, onChange,
}: {
  label:    string
  value:    number
  min:      number
  max:      number
  onChange: (v: number) => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 h-10 rounded-md border"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
    >
      <span className="text-sm font-semibold text-content">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <StepperButton onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</StepperButton>
        <span className="w-5 text-center text-base font-bold tabular-nums">{value}</span>
        <StepperButton onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</StepperButton>
      </div>
    </div>
  )
}

function StepperButton({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-md border text-base font-bold cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default"
      style={{
        background:  'var(--color-surf-3)',
        borderColor: 'var(--color-border-2)',
        color:       'var(--color-content)',
      }}
    >
      {children}
    </button>
  )
}

function CompactToggle({
  label, hint, checked, onChange,
}: {
  label:    string
  hint:     string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border cursor-pointer text-left"
      style={{
        background:  checked ? 'var(--color-surf-2)' : 'transparent',
        borderColor: checked ? 'var(--color-border-2)' : 'var(--color-border)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-content leading-none mb-0.5">{label}</div>
        <div className="text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>{hint}</div>
      </div>
      <Toggle checked={checked} />
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
