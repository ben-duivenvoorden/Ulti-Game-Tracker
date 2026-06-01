import type { VisLogEntry, EventId } from './types'
import { isMutedLogEntry } from './format'

// ─── Visual-log pattern layer ──────────────────────────────────────────────────
// A general, multi-event annotation pass over the visible log. Patterns are
// DERIVED from the event stream — there are no dedicated buttons. Each detector
// recognises a shape (e.g. a defensive intercept immediately followed by a goal
// = Callahan) and tags the event the annotation should hang off.
//
// To add a pattern (give-and-go, hammer-for-score, …) add a detector to
// DETECTORS — the rendering layer maps eventId → LogPattern automatically.

export interface LogPattern {
  /** Event the badge annotates (usually the culminating event). */
  eventId: EventId
  /** Short all-caps badge label. */
  label: string
  /** Accent colour (CSS var). */
  color: string
}

type Detector = (visLog: VisLogEntry[]) => LogPattern[]

/** Index of the previous *significant* (non-muted) entry — possession passes,
 *  system lines and point-start dividers don't break an adjacency pattern. */
function prevSignificant(visLog: VisLogEntry[], from: number): VisLogEntry | null {
  for (let i = from - 1; i >= 0; i--) {
    if (!isMutedLogEntry(visLog[i].type)) return visLog[i]
  }
  return null
}

// Callahan: a defence intercepts and the same team immediately scores — the
// interceptor caught it in their attacking end-zone and the disc never changed
// hands. We treat any intercept-then-goal by the same team (with only muted
// entries between) as the pattern.
const detectCallahan: Detector = (visLog) => {
  const out: LogPattern[] = []
  for (let i = 0; i < visLog.length; i++) {
    const e = visLog[i]
    if (e.type !== 'goal') continue
    const prev = prevSignificant(visLog, i)
    if (prev && prev.type === 'intercept' && prev.teamId === e.teamId) {
      out.push({ eventId: e.id, label: 'CALLAHAN', color: 'var(--color-intercept)' })
    }
  }
  return out
}

const DETECTORS: Detector[] = [detectCallahan]

/** Run every detector over the visible log and return a map from annotated
 *  eventId → its pattern (last write wins if two patterns target one event). */
export function detectLogPatterns(visLog: VisLogEntry[]): Map<EventId, LogPattern> {
  const map = new Map<EventId, LogPattern>()
  for (const detect of DETECTORS) {
    for (const p of detect(visLog)) map.set(p.eventId, p)
  }
  return map
}
