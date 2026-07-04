import { useRef, useState } from 'react'
import { MicIcon } from '@/components/ui/Icons'
import type { VoicePlugin, VoiceCaptureResult } from '@/core/voice/plugin'

// Push-to-talk floating button. Hold = capture, release = transcribe + hand
// the result to the caller, drag off = cancel. First use may need the model
// downloaded — the button shows a preparing state and starts listening once
// ready. Renders nothing unless the caller has a live VoicePlugin, so the
// plain PWA is untouched.

type PttState = 'idle' | 'preparing' | 'listening' | 'busy'

export function VoicePTT({ voice, bias, onResult, title = 'Hold to speak' }: {
  voice:    VoicePlugin
  bias?:    string
  onResult: (result: VoiceCaptureResult) => void
  title?:   string
}) {
  const [state, setState] = useState<PttState>('idle')
  // Pointer already released (or cancelled) while start/download was in
  // flight — the async start path checks this before listening.
  const releasedRef = useRef(false)

  const start = async () => {
    if (state !== 'idle') return
    releasedRef.current = false
    try {
      const { ready } = await voice.isModelReady()
      if (!ready) {
        setState('preparing')
        await voice.downloadModel()
      }
      if (releasedRef.current) { setState('idle'); return }
      await voice.startCapture(bias ? { bias } : undefined)
      if (releasedRef.current) {
        await voice.cancelCapture()
        setState('idle')
        return
      }
      setState('listening')
    } catch {
      setState('idle')
    }
  }

  const finish = async () => {
    releasedRef.current = true
    if (state !== 'listening') return
    setState('busy')
    try {
      const result = await voice.stopCapture()
      onResult(result)
    } catch { /* capture failed — nothing to hand over */ }
    setState('idle')
  }

  const cancel = async () => {
    releasedRef.current = true
    if (state !== 'listening') return
    try { await voice.cancelCapture() } catch { /* already stopped */ }
    setState('idle')
  }

  const listening = state === 'listening'
  return (
    <button
      type="button"
      data-testid="voice-ptt"
      onPointerDown={() => { void start() }}
      onPointerUp={() => { void finish() }}
      onPointerLeave={() => { void cancel() }}
      onPointerCancel={() => { void cancel() }}
      onContextMenu={e => e.preventDefault()}
      className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer select-none"
      style={{
        background: listening ? 'var(--color-danger)' : 'var(--color-team-a)',
        color:      '#fff',
        boxShadow:  listening
          ? '0 0 0 6px color-mix(in srgb, var(--color-danger) 30%, transparent), 0 6px 18px rgba(0,0,0,0.4)'
          : '0 6px 18px rgba(0,0,0,0.4)',
        opacity:    state === 'busy' || state === 'preparing' ? 0.6 : 1,
        touchAction: 'none',
      }}
      title={state === 'preparing' ? 'Preparing voice model…' : title}
      aria-label={title}
    >
      <MicIcon size={26} />
    </button>
  )
}
