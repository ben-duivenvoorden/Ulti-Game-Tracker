// ─── VoicePlugin bridge ───────────────────────────────────────────────────────
// The Capacitor plugin boundary. The native side (Android: whisper.cpp via
// JNI; iOS later: WhisperKit) is app-agnostic — push-to-talk capture in, plain
// transcript out. Everything UGT-specific (matching, parsing, validation)
// stays in TS where Vitest can reach it.
//
// `getVoice()` is null in a plain browser — the PTT UI simply doesn't render
// on the PWA. A dev mock (localStorage `ugt-voice-mock` = '1') stands in for
// the native side so the capture→match→UI loop can be driven end-to-end
// without a device: it "hears" whatever `ugt-voice-mock-transcript` holds.

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'

export interface VoiceCaptureToken {
  word: string
  conf: number
  t0:   number
  t1:   number
}

export interface VoiceCaptureResult {
  transcript: string
  tokens:     VoiceCaptureToken[]
}

/** One pause-closed segment transcribed mid-capture. `aggregate` is the full
 *  transcript so far — the UI can render it directly. */
export interface VoicePartial {
  seq:        number
  transcript: string
  aggregate:  string
}

export interface VoicePlugin {
  isModelReady(): Promise<{ ready: boolean; sizeMb: number }>
  /** One-time model fetch; emits `downloadProgress` events natively. */
  downloadModel(): Promise<void>
  /** Pointer-down. `bias` seeds whisper's initial_prompt with the candidate
   *  names/aliases (+ outcome words in event mode) so decoding leans toward
   *  the roster. */
  startCapture(options?: { bias?: string }): Promise<void>
  /** Pointer-up. */
  stopCapture(): Promise<VoiceCaptureResult>
  /** Pointer-cancel / drag-off. */
  cancelCapture(): Promise<void>
  /** Capacitor's built-in permission surface for the `microphone` alias —
   *  requested up-front by the PTT setup step, so the permission dialog never
   *  fights a hold-to-talk press for the pointer. */
  checkPermissions(): Promise<{ microphone: PermissionState }>
  requestPermissions(): Promise<{ microphone: PermissionState }>
  addListener(
    eventName: 'downloadProgress',
    listener: (event: { progress: number }) => void,
  ): Promise<PluginListenerHandle>
  /** Long holds are pause-segmented natively; each closed segment fires one
   *  of these while capture keeps rolling. */
  addListener(
    eventName: 'partialTranscript',
    listener: (event: VoicePartial) => void,
  ): Promise<PluginListenerHandle>
}

const native = registerPlugin<VoicePlugin>('Voice')

const MOCK_FLAG       = 'ugt-voice-mock'
const MOCK_TRANSCRIPT = 'ugt-voice-mock-transcript'

// Mock partials: the mock transcript splits on commas/full stops and "speaks"
// one clause every 800 ms, so the live caption strip can be driven end-to-end
// in a plain browser.
const mockPartialListeners = new Set<(e: VoicePartial) => void>()
let mockTimers: ReturnType<typeof setTimeout>[] = []

function mockClearTimers() {
  for (const t of mockTimers) clearTimeout(t)
  mockTimers = []
}

const mockVoice: VoicePlugin = {
  isModelReady: () => Promise.resolve({ ready: true, sizeMb: 0 }),
  downloadModel: () => Promise.resolve(),
  startCapture: () => {
    mockClearTimers()
    const transcript = localStorage.getItem(MOCK_TRANSCRIPT) ?? ''
    const clauses = transcript.split(/[,.]+/).map(c => c.trim()).filter(c => c.length > 0)
    // The final clause arrives with stopCapture, like the native tail.
    clauses.slice(0, -1).forEach((clause, i) => {
      mockTimers.push(setTimeout(() => {
        const aggregate = clauses.slice(0, i + 1).join(' ')
        for (const l of mockPartialListeners) l({ seq: i, transcript: clause, aggregate })
      }, (i + 1) * 800))
    })
    return Promise.resolve()
  },
  stopCapture: () => {
    mockClearTimers()
    const transcript = localStorage.getItem(MOCK_TRANSCRIPT) ?? ''
    return Promise.resolve({ transcript, tokens: [] })
  },
  cancelCapture: () => {
    mockClearTimers()
    return Promise.resolve()
  },
  checkPermissions: () => Promise.resolve({ microphone: 'granted' as PermissionState }),
  requestPermissions: () => Promise.resolve({ microphone: 'granted' as PermissionState }),
  addListener: ((eventName: string, listener: (e: never) => void) => {
    if (eventName === 'partialTranscript') {
      const l = listener as (e: VoicePartial) => void
      mockPartialListeners.add(l)
      return Promise.resolve({ remove: () => { mockPartialListeners.delete(l); return Promise.resolve() } })
    }
    return Promise.resolve({ remove: () => Promise.resolve() })
  }) as VoicePlugin['addListener'],
}

export function getVoice(): VoicePlugin | null {
  try {
    if (localStorage.getItem(MOCK_FLAG) === '1') return mockVoice
  } catch { /* storage unavailable (SSR / privacy mode) — fall through */ }
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Voice') ? native : null
}

/** Word list for the matcher/parser. Prefers the transcript (whisper tokens
 *  are subwords); strips punctuation artifacts. */
export function resultWords(result: VoiceCaptureResult): string[] {
  return result.transcript.split(/[\s,.!?]+/).filter(w => w.length > 0)
}
