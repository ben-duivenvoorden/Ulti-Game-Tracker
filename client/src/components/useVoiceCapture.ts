import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoicePlugin, VoiceCaptureResult, VoicePartial } from '@/core/voice/plugin'
import { tailWords, transcriptWords } from '@/core/voice/segments'

// Toggle-mode voice capture. First use is an explicit setup TAP: it requests
// the mic permission and downloads the model with visible progress — nothing
// is captured. Once ready: tap = start listening, tap again = stop (the
// unheard tail is transcribed and delivered), while every system-initiated
// stop CANCELS instead — a tail parsed after the game state moved on (goal →
// point summary, preview entered, screen left) would land wrong, so it's
// discarded.
//
// Words are delivered incrementally through `onWords`: one call per
// pause-closed segment mid-capture, plus one final call for the tail on
// tap-stop. The applied-word count makes the tail exact: words(final
// transcript) is the concatenation of every segment's words (see
// core/voice/segments.ts), so slicing past the already-delivered count can
// neither drop nor double-deliver a word — even for segments that close in
// the gap between the stop tap and the native drain.

export type VoiceCaptureUi =
  | 'unavailable'   // no engine (plain PWA) — render nothing
  | 'checking'      // model-ready probe in flight
  | 'setup'         // needs the one-tap permission + model download
  | 'preparing'     // download running (see `progress`)
  | 'idle'
  | 'listening'
  | 'stopping'      // stop tapped, tail decode in flight

export interface VoiceCapture {
  ui:         VoiceCaptureUi
  /** Model download progress, 0..1 — meaningful while `preparing`. */
  progress:   number
  /** Aggregate transcript of the current capture ('' when idle) — feeds the
   *  ticker. Display only; word accounting never derives from it. */
  transcript: string
  /** Setup / start / stop, depending on `ui`. */
  toggle():   void
  /** System-initiated stop: discard the unheard tail, return to idle. */
  cancel():   void
}

export function useVoiceCapture({ voice, bias, onStart, onWords, onResult, onEnded }: {
  voice: VoicePlugin | null
  bias?: string
  /** Capture actually began — clear per-capture UI state here. */
  onStart?: () => void
  /** Never-before-delivered words: one pause segment mid-capture, or the
   *  tail on tap-stop (`final: true`). */
  onWords?: (words: string[], info: { final: boolean }) => void
  /** Full stitched result on tap-stop — for apply-on-stop consumers. */
  onResult?: (result: VoiceCaptureResult) => void
  onEnded?: (reason: 'stopped' | 'cancelled') => void
}): VoiceCapture {
  const [ui, setUi] = useState<VoiceCaptureUi>(voice ? 'checking' : 'unavailable')
  const [progress, setProgress] = useState(0)
  const [transcript, setTranscript] = useState('')

  // Applying a segment changes the parse context (holder / possession), so
  // the next partial must run through the LATEST render's callbacks — route
  // everything via a per-render-updated ref.
  const cbRef = useRef({ onStart, onWords, onResult, onEnded })
  cbRef.current = { onStart, onWords, onResult, onEnded }

  // Read inside async paths and the partial listener without stale closures.
  const uiRef = useRef(ui)
  uiRef.current = ui
  const biasRef = useRef(bias)
  biasRef.current = bias
  // Words already delivered from partials this capture — the tail slice point.
  const appliedWordsRef = useRef(0)
  // Serialises toggle taps: a second tap during an in-flight transition no-ops.
  const busyRef = useRef(false)
  // Cancel requested while start was still in flight — checked after
  // startCapture resolves so the capture never outlives the request.
  const cancelRequestedRef = useRef(false)

  useEffect(() => {
    if (!voice) return
    let alive = true
    voice.isModelReady()
      .then(({ ready }) => { if (alive) setUi(ready ? 'idle' : 'setup') })
      .catch(() => { if (alive) setUi('setup') })
    return () => { alive = false }
  }, [voice])

  // One subscription per engine; partials are ignored unless actively
  // listening — a segment that closes after the stop tap is NOT delivered
  // here, its words arrive inside the tail slice instead.
  useEffect(() => {
    if (!voice) return
    let alive = true
    let handle: Awaited<ReturnType<VoicePlugin['addListener']>> | null = null
    void voice.addListener('partialTranscript', (e: VoicePartial) => {
      if (!alive || uiRef.current !== 'listening') return
      setTranscript(e.aggregate)
      const words = transcriptWords(e.transcript)
      appliedWordsRef.current += words.length
      if (words.length > 0) cbRef.current.onWords?.(words, { final: false })
    })
      .then(h => {
        if (alive) handle = h
        else void h.remove()
      })
    return () => { alive = false; void handle?.remove() }
  }, [voice])

  // Unmount safety net: without this the native recorder runs forever under
  // whatever screen comes next. cancelCapture is idempotent (native bumps
  // captureGen and drops stale jobs; the mock clears timers).
  useEffect(() => {
    if (!voice) return
    return () => {
      if (uiRef.current === 'listening' || uiRef.current === 'stopping') {
        void voice.cancelCapture()
      }
    }
  }, [voice])

  // One-tap setup: permission first (its dialog would swallow a capture tap
  // anyway), then the model download with progress. Failure returns to
  // 'setup' so another tap retries.
  const setup = async () => {
    if (!voice) return
    setUi('preparing')
    setProgress(0)
    try { await voice.requestPermissions() } catch { /* re-asked on capture */ }
    let sub = null as Awaited<ReturnType<VoicePlugin['addListener']>> | null
    try {
      sub = await voice.addListener('downloadProgress', e => setProgress(e.progress))
      await voice.downloadModel()
      setUi('idle')
    } catch (err) {
      console.warn('[voice] model download failed', err)
      setUi('setup')
    } finally {
      void sub?.remove()
    }
  }

  const start = async () => {
    if (!voice) return
    try {
      const { microphone } = await voice.checkPermissions()
      if (microphone !== 'granted') {
        // Treat this tap as the permission ask; the next tap records.
        await voice.requestPermissions()
        return
      }
      appliedWordsRef.current = 0
      cancelRequestedRef.current = false
      setTranscript('')
      const bias = biasRef.current
      await voice.startCapture(bias ? { bias } : undefined)
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false
        await voice.cancelCapture()
        setUi('idle')
        return
      }
      cbRef.current.onStart?.()
      setUi('listening')
    } catch (err) {
      console.warn('[voice] capture start failed', err)
      setUi('idle')
    }
  }

  const stop = async () => {
    if (!voice) return
    setUi('stopping')
    try {
      const result = await voice.stopCapture()
      const tail = tailWords(result.transcript, appliedWordsRef.current)
      if (tail.length > 0) cbRef.current.onWords?.(tail, { final: true })
      cbRef.current.onResult?.(result)
      cbRef.current.onEnded?.('stopped')
    } catch {
      // Nothing recoverable — the capture is gone either way.
      cbRef.current.onEnded?.('cancelled')
    }
    setTranscript('')
    setUi('idle')
  }

  // Stable identities (state lives in refs) so consumers can hang effects
  // off them — e.g. "cancel when narration stops being valid".
  const toggle = useCallback(() => {
    if (busyRef.current) return
    const run = async () => {
      busyRef.current = true
      try {
        if (uiRef.current === 'setup') await setup()
        else if (uiRef.current === 'idle') await start()
        else if (uiRef.current === 'listening') await stop()
      } finally {
        busyRef.current = false
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  const cancel = useCallback(() => {
    if (!voice) return
    if (uiRef.current === 'listening') {
      setTranscript('')
      setUi('idle')
      try { void voice.cancelCapture() } catch { /* already stopped */ }
      cbRef.current.onEnded?.('cancelled')
    } else if (busyRef.current) {
      // Start still in flight — flag it so the start path cancels on arrival.
      cancelRequestedRef.current = true
    }
  }, [voice])

  return { ui, progress, transcript, toggle, cancel }
}
