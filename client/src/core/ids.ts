// ─── Opaque id generation ─────────────────────────────────────────────────────
// Segment and scorer ids are random, globally-unique strings — distinct from
// the per-segment monotonic EventIds (which restart at 1 in every segment).
// Kept tiny and dependency-free; `crypto.randomUUID` where available, with a
// best-effort fallback for older runtimes / test environments.

import type { SegmentId, ScorerId, DeviceId } from './types'

function randomToken(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function newSegmentId(): SegmentId {
  return `seg_${randomToken()}`
}

export function newScorerId(): ScorerId {
  return `scorer_${randomToken()}`
}

export function newDeviceId(): DeviceId {
  return `dev_${randomToken()}`
}
