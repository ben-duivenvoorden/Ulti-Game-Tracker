import { Label } from '@/components/ui/Label'

// ─── Shared form kit ──────────────────────────────────────────────────────────
// One implementation of the small form controls that used to be re-declared
// per screen (NewGame, GameSettings, TeamsManager, LineSelection): a titled
// section card, labelled text / colour inputs, a numeric stepper, and the
// M/F matching-division select.

export function Section({ title, children, className = '' }: {
  title:      string
  children:   React.ReactNode
  className?: string
}) {
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

export function TextField({ label, value, onChange, placeholder, autoFocus }: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  autoFocus?:   boolean
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

export function ColorField({ label, value, onChange }: {
  label:    string
  value:    string
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

export function Stepper({ label, value, min, max, onChange }: {
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
        <span className="w-6 text-center text-base font-bold tabular-nums">{value}</span>
        <StepperButton onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</StepperButton>
      </div>
    </div>
  )
}

function StepperButton({ children, onClick, disabled }: {
  children:  string
  onClick:   () => void
  disabled?: boolean
}) {
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

/** M/F matching-division select. `labels` swaps in the long MMP/FMP wording
 *  where the surrounding layout doesn't already convey the division. */
export function GenderSelect({ value, onChange, labels = { M: 'M', F: 'F' }, title }: {
  value:    'M' | 'F'
  onChange: (v: 'M' | 'F') => void
  labels?:  { M: string; F: string }
  title?:   string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as 'M' | 'F')}
      className="h-9 px-2 rounded-md border text-sm font-mono text-content cursor-pointer flex-shrink-0"
      style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
      title={title}
    >
      <option value="M">{labels.M}</option>
      <option value="F">{labels.F}</option>
    </select>
  )
}
