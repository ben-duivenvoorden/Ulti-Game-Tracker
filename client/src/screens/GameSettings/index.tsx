import { useGameActions, useRecordingOptions } from '@/core/selectors'
import { Btn } from '@/components/ui/Btn'
import { Section, Stepper } from '@/components/ui/form'
import { ScreenHeader } from '@/components/ScreenHeader'

export default function GameSettings() {
  const { closeGameSettings, updateRecordingOption } = useGameActions()
  const options = useRecordingOptions()

  return (
    <div className="h-full flex flex-col bg-bg text-content">
      <ScreenHeader
        onBack={closeGameSettings}
        backTitle="Back"
        kicker="RECORDING SETTINGS"
        title={<span className="text-sm">Configure what events are tracked</span>}
        right={<Btn variant="primary" size="md" onClick={closeGameSettings}>Done</Btn>}
      />

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
            <Stepper
              label="Players per line"
              value={options.lineSize}
              onChange={v => updateRecordingOption('lineSize', v)}
              min={1}
              max={15}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {/* In mixed, line size is derived from MMP + FMP so the ratio
                  always sums to it. Spell the terms out here (first appearance). */}
              <Stepper
                label="MMP (Male Matching)"
                value={options.lineRatio.M}
                onChange={v => {
                  const r = { ...options.lineRatio, M: v }
                  updateRecordingOption('lineRatio', r)
                  updateRecordingOption('lineSize', r.M + r.F)
                }}
                min={0}
                max={15}
              />
              <Stepper
                label="FMP (Female Matching)"
                value={options.lineRatio.F}
                onChange={v => {
                  const r = { ...options.lineRatio, F: v }
                  updateRecordingOption('lineRatio', r)
                  updateRecordingOption('lineSize', r.M + r.F)
                }}
                min={0}
                max={15}
              />
              <div
                className="flex items-center justify-between px-3 h-9 rounded-md text-sm"
                style={{ background: 'var(--color-surf)', color: 'var(--color-muted)' }}
              >
                <span className="font-mono tracking-wide text-[11px]">LINE SIZE</span>
                <span className="font-bold tabular-nums text-content">{options.lineRatio.M + options.lineRatio.F}</span>
              </div>
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

        <Section title="SCORER INFO">
          <div className="text-[10px] mb-1" style={{ color: 'var(--color-muted)' }}>
            Shown behind the (i) bubble during scoring &amp; line selection.
          </div>
          <textarea
            value={options.scorerInfo}
            onChange={e => updateRecordingOption('scorerInfo', e.target.value)}
            placeholder="Briefing for whoever's scoring — reminders, conventions, anything…"
            rows={4}
            className="w-full px-3 py-2 rounded-md border text-sm text-content resize-y"
            style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
          />
        </Section>
      </div>

    </div>
  )
}

// ── Building blocks ────────────────────────────────────────────────────────────

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
