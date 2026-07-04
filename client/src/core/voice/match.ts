// ─── Voice token → player matching ────────────────────────────────────────────
// Pure. Candidates are whatever roster the calling mode supplies (line mode:
// the selecting team's full roster; event mode: the active line). Each player
// is speakable by any single word of their name plus every spoken alias —
// matched phonetically (Double-Metaphone) with a Levenshtein tiebreak, so
// "Bennie" finds Ben and a windswept "Adeelya" still finds Adilia.

import { doubleMetaphone } from 'double-metaphone'

export interface SpeakablePlayer {
  id:            number
  name:          string
  spokenAliases: string[]
}

export interface TokenMatch {
  /** Best candidate, or null when nothing clears MIN_CONFIDENCE. */
  playerId:   number | null
  playerName: string | null
  /** 0–1. ≥ AUTO_CONFIDENCE is a confident hit; between MIN and AUTO the
   *  match should be surfaced for eyeballing (amber); below MIN it's
   *  unmatched and must be shown to the scorer, never dropped. */
  confidence: number
  token:      string
}

/** Confident hit — apply silently. */
export const AUTO_CONFIDENCE = 0.8
/** Below this the token is unmatched. */
export const MIN_CONFIDENCE  = 0.5
/** Two different players scoring within this margin = ambiguous — the match
 *  is demoted to flag territory rather than silently picking one. */
const AMBIGUITY_MARGIN = 0.08

const normalize = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

/** Levenshtein distance, plain DP — inputs are single short words. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

const similarity = (a: string, b: string) =>
  1 - levenshtein(a, b) / Math.max(a.length, b.length)

interface SpeakableForm {
  playerId:   number
  playerName: string
  form:       string
  keys:       [string, string]
}

/** Score one token against one speakable form. Exact > phonetic > fuzzy;
 *  phonetic hits are shaded by string similarity so "Ben"/"Bin" (same key)
 *  outranks "Ben"/"Bowen" (same key, further apart). */
function scoreForm(token: string, tokenKeys: [string, string], f: SpeakableForm): number {
  if (token === f.form) return 1
  const sim = similarity(token, f.form)
  const primaryHit   = tokenKeys[0] === f.keys[0]
  const secondaryHit = !primaryHit && (
    tokenKeys[0] === f.keys[1] || tokenKeys[1] === f.keys[0] || tokenKeys[1] === f.keys[1]
  )
  if (primaryHit)   return 0.8 + 0.2 * sim
  if (secondaryHit) return 0.7 + 0.2 * sim
  // No phonetic agreement — fuzzy only, capped below the flag band so a pure
  // spelling coincidence can never auto-apply.
  return sim * 0.75
}

export interface PlayerMatcher {
  match: (word: string) => TokenMatch
}

export function buildMatcher(players: SpeakablePlayer[]): PlayerMatcher {
  const forms: SpeakableForm[] = []
  for (const p of players) {
    const speakables = new Set<string>()
    for (const word of p.name.split(/\s+/)) {
      const n = normalize(word)
      if (n.length >= 2) speakables.add(n)
    }
    for (const alias of p.spokenAliases) {
      const n = normalize(alias)
      if (n.length >= 1) speakables.add(n)
    }
    for (const form of speakables) {
      forms.push({ playerId: p.id, playerName: p.name, form, keys: doubleMetaphone(form) as [string, string] })
    }
  }

  return {
    match(word: string): TokenMatch {
      const token = normalize(word)
      if (token.length === 0) return { playerId: null, playerName: null, confidence: 0, token: word }
      const tokenKeys = doubleMetaphone(token) as [string, string]

      // Best score per player, then compare the top two players.
      const best = new Map<number, { score: number; name: string }>()
      for (const f of forms) {
        const s = scoreForm(token, tokenKeys, f)
        const cur = best.get(f.playerId)
        if (!cur || s > cur.score) best.set(f.playerId, { score: s, name: f.playerName })
      }

      let top: { id: number; score: number; name: string } | null = null
      let runnerUp = 0
      for (const [id, { score, name }] of best) {
        if (!top || score > top.score) {
          runnerUp = top?.score ?? 0
          top = { id, score, name }
        } else if (score > runnerUp) {
          runnerUp = score
        }
      }

      if (!top || top.score < MIN_CONFIDENCE) {
        return { playerId: null, playerName: null, confidence: top?.score ?? 0, token: word }
      }
      // Ambiguous between two players — demote below the auto band so it
      // surfaces for review instead of silently picking a side.
      const confidence = (top.score - runnerUp) < AMBIGUITY_MARGIN
        ? Math.min(top.score, AUTO_CONFIDENCE - 0.01)
        : top.score
      return { playerId: top.id, playerName: top.name, confidence, token: word }
    },
  }
}
