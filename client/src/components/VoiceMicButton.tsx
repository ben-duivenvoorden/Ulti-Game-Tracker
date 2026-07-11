import { MicIcon } from '@/components/ui/Icons'
import type { VoiceCapture } from '@/components/useVoiceCapture'

// The mic itself — a dumb toggle face over useVoiceCapture. Two shapes:
//   strip — compact square that docks into the LogPeek row (h-full)
//   fab   — the floating round button (LineSelection)
// Both share the chrome: red while listening, ↓ badge when setup is needed,
// % while the model downloads, dimmed when disabled. A disabled tap no-ops
// EXCEPT the setup tap — model download and the mic permission are never
// gated on game state.

export function VoiceMicButton({ capture, variant, disabled = false, title }: {
  capture:   VoiceCapture
  variant:   'strip' | 'fab'
  disabled?: boolean
  title?:    string
}) {
  const { ui, progress } = capture
  if (ui === 'unavailable') return null

  const listening = ui === 'listening'
  const hint =
    ui === 'setup'       ? 'Tap to set up voice (mic access + ~31 MB model)'
    : ui === 'preparing' ? 'Preparing voice model…'
    : ui === 'listening' ? 'Tap to stop listening'
    : title ?? 'Tap to start voice narration'
  const dimmed = ui === 'stopping' || ui === 'checking' || (disabled && ui !== 'setup')

  const face = ui === 'preparing' ? (
    <span className="text-xs font-bold tabular-nums">{Math.round(progress * 100)}%</span>
  ) : (
    <>
      <MicIcon size={variant === 'fab' ? 26 : 18} />
      {ui === 'setup' && (
        <span
          className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: 'var(--color-warn)', color: '#111' }}
          aria-hidden
        >
          ↓
        </span>
      )}
    </>
  )

  const shape = variant === 'fab'
    ? 'w-14 h-14 rounded-full'
    : 'h-full w-12'
  const style = variant === 'fab'
    ? {
        background: listening ? 'var(--color-danger)' : 'var(--color-team-a)',
        color:      '#fff',
        boxShadow:  listening
          ? '0 0 0 6px color-mix(in srgb, var(--color-danger) 30%, transparent), 0 6px 18px rgba(0,0,0,0.4)'
          : '0 6px 18px rgba(0,0,0,0.4)',
      }
    : {
        background:  listening ? 'var(--color-danger)' : 'transparent',
        color:       listening ? '#fff' : 'var(--color-team-a)',
        borderRight: '1px solid var(--color-border)',
      }

  return (
    <button
      type="button"
      data-testid="voice-mic"
      onClick={() => {
        if (disabled && ui !== 'setup') return
        capture.toggle()
      }}
      className={`${shape} flex items-center justify-center cursor-pointer select-none relative flex-shrink-0`}
      style={{ ...style, opacity: dimmed ? 0.45 : 1 }}
      title={hint}
      aria-label={hint}
      aria-pressed={listening}
    >
      {listening && variant === 'strip' && (
        <span
          className="absolute inset-0 animate-pulse pointer-events-none"
          style={{ background: 'color-mix(in srgb, var(--color-danger) 25%, transparent)' }}
          aria-hidden
        />
      )}
      {face}
    </button>
  )
}
