import { useEffect, useRef, useState } from 'react'
import { MicIcon } from '@/components/ui/Icons'
import type { VoicePlugin, VoiceCaptureResult } from '@/core/voice/plugin'

// Push-to-talk floating button. First use is an explicit setup TAP: it
// requests the mic permission and downloads the model with visible progress —
// nothing is captured. Once ready: hold = capture, release = transcribe +
// hand the result to the caller, drag off = cancel. (The old flow hid the
// 31 MB download and the permission request inside the first hold, which
// looked like a dead button.) Renders nothing unless the caller has a live
// VoicePlugin, so the plain PWA is untouched.

type PttState = 'checking' | 'setup' | 'preparing' | 'idle' | 'listening' | 'busy'

export function VoicePTT({ voice, bias, onResult, title = 'Hold to speak' }: {
  voice:    VoicePlugin
  bias?:    string
  onResult: (result: VoiceCaptureResult) => void
  title?:   string
}) {
  const [state, setState] = useState<PttState>('checking')
  const [progress, setProgress] = useState(0)
  // Pointer already released (or cancelled) while start was in flight — the
  // async start path checks this before listening.
  const releasedRef = useRef(false)

  useEffect(() => {
    let alive = true
    voice.isModelReady()
      .then(({ ready }) => { if (alive) setState(ready ? 'idle' : 'setup') })
      .catch(() => { if (alive) setState('setup') })
    return () => { alive = false }
  }, [voice])

  // One-tap setup: permission first (the dialog would cancel a hold anyway),
  // then the model download with progress. Failure returns to 'setup' so a
  // second tap retries.
  const setup = async () => {
    setState('preparing')
    setProgress(0)
    try { await voice.requestPermissions() } catch { /* re-asked on capture */ }
    let sub = null as Awaited<ReturnType<VoicePlugin['addListener']>> | null
    try {
      sub = await voice.addListener('downloadProgress', e => setProgress(e.progress))
      await voice.downloadModel()
      setState('idle')
    } catch (err) {
      console.warn('[voice] model download failed', err)
      setState('setup')
    } finally {
      void sub?.remove()
    }
  }

  const start = async () => {
    if (state === 'setup') { void setup(); return }
    if (state !== 'idle') return
    releasedRef.current = false
    try {
      const { microphone } = await voice.checkPermissions()
      if (microphone !== 'granted') {
        // The system dialog steals the pointer — treat this press as the
        // permission ask; the next hold records.
        await voice.requestPermissions()
        return
      }
      await voice.startCapture(bias ? { bias } : undefined)
      if (releasedRef.current) {
        await voice.cancelCapture()
        setState('idle')
        return
      }
      setState('listening')
    } catch (err) {
      console.warn('[voice] capture start failed', err)
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
  const hint =
    state === 'setup'     ? 'Tap to set up voice (mic access + ~31 MB model)'
    : state === 'preparing' ? 'Preparing voice model…'
    : title
  return (
    <button
      type="button"
      data-testid="voice-ptt"
      onPointerDown={() => { void start() }}
      onPointerUp={() => { void finish() }}
      onPointerLeave={() => { void cancel() }}
      onPointerCancel={() => { void cancel() }}
      onContextMenu={e => e.preventDefault()}
      className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer select-none relative"
      style={{
        background: listening ? 'var(--color-danger)' : 'var(--color-team-a)',
        color:      '#fff',
        boxShadow:  listening
          ? '0 0 0 6px color-mix(in srgb, var(--color-danger) 30%, transparent), 0 6px 18px rgba(0,0,0,0.4)'
          : '0 6px 18px rgba(0,0,0,0.4)',
        opacity:    state === 'busy' || state === 'checking' ? 0.6 : 1,
        touchAction: 'none',
      }}
      title={hint}
      aria-label={hint}
    >
      {state === 'preparing' ? (
        <span className="text-xs font-bold tabular-nums">{Math.round(progress * 100)}%</span>
      ) : (
        <>
          <MicIcon size={26} />
          {state === 'setup' && (
            <span
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'var(--color-warn)', color: '#111' }}
              aria-hidden
            >
              ↓
            </span>
          )}
        </>
      )}
    </button>
  )
}
