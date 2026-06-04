import { Btn } from '@/components/ui/Btn'

// In-app replacement for `window.confirm` — a centred yes/no dialog matching the
// app's other modals. Render inside a `relative` container; backdrop tap cancels.
interface ConfirmSheetProps {
  open:          boolean
  title:         string
  message?:      string
  confirmLabel?: string
  cancelLabel?:  string
  danger?:       boolean
  onConfirm:     () => void
  onCancel:      () => void
}

export function ConfirmSheet({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel,
}: ConfirmSheetProps) {
  if (!open) return null
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
        {message && <div className="text-[12px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>{message}</div>}
        <div className="flex gap-2 mt-1">
          <Btn variant="ghost"                       size="md" full onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} size="md" full onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  )
}
