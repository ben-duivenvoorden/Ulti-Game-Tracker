import { useEffect, useRef, useState } from 'react'
import { Btn } from '@/components/ui/Btn'

// In-app replacement for `window.prompt` — a small centred input dialog that
// matches the app's other modals (OverrideDialog / ResumeFromScoreDialog).
// Render it inside a `relative` container; tap the backdrop or Esc to cancel.
interface PromptSheetProps {
  open:          boolean
  title:         string
  label?:        string
  placeholder?:  string
  initialValue?: string
  confirmLabel?: string
  onSubmit:      (value: string) => void
  onCancel:      () => void
}

export function PromptSheet({
  open, title, label, placeholder, initialValue = '', confirmLabel = 'Save', onSubmit, onCancel,
}: PromptSheetProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open, initialValue])

  if (!open) return null
  const submit = () => { const v = value.trim(); if (v) onSubmit(v) }

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
        <div className="text-sm font-bold text-content">{title}</div>
        {label && (
          <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
            {label.toUpperCase()}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          placeholder={placeholder}
          className="h-10 px-3 rounded-md border text-sm font-medium text-content"
          style={{ background: 'var(--color-surf-2)', borderColor: 'var(--color-border-2)' }}
        />
        <div className="flex gap-2 mt-1">
          <Btn variant="ghost"   size="md" full onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" size="md" full disabled={value.trim().length === 0} onClick={submit}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  )
}
