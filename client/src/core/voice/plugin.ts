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
}

const native = registerPlugin<VoicePlugin>('Voice')

const MOCK_FLAG       = 'ugt-voice-mock'
const MOCK_TRANSCRIPT = 'ugt-voice-mock-transcript'

const mockVoice: VoicePlugin = {
  isModelReady: () => Promise.resolve({ ready: true, sizeMb: 0 }),
  downloadModel: () => Promise.resolve(),
  startCapture: () => Promise.resolve(),
  stopCapture: () => {
    const transcript = localStorage.getItem(MOCK_TRANSCRIPT) ?? ''
    return Promise.resolve({ transcript, tokens: [] })
  },
  cancelCapture: () => Promise.resolve(),
  checkPermissions: () => Promise.resolve({ microphone: 'granted' as PermissionState }),
  requestPermissions: () => Promise.resolve({ microphone: 'granted' as PermissionState }),
  addListener: () => Promise.resolve({ remove: () => Promise.resolve() }),
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
