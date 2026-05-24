// Suggested short-name derivation. Run on the user's team-name input to
// pre-fill the short field; the user can still edit it. Used in
// compressed UI spaces (the score header, team chips) where the long
// name doesn't fit.
//
// Rules:
//   - Multi-word names: take the first letter of each word, capped at
//     `max`. "Lounge Lizards Eastside" → "LLE", "New York Empire" → "NYE".
//   - Single-word names: take the first `max` characters. "Empire" →
//     "EMPIR", "Goose" → "GOOSE".
//   - Always upper-cased; whitespace and empty parts collapsed.
//
// `max` defaults to 5 — the cap we display short names at across the app.
export const SHORT_NAME_MAX = 5

export function suggestShortName(name: string, max: number = SHORT_NAME_MAX): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(0, max).map(p => p.charAt(0).toUpperCase()).join('')
  }
  return trimmed.slice(0, max).toUpperCase()
}

// ─── Long-vs-short display convention ───────────────────────────────────────
// Convention: prefer the full team name. When either team's long name
// doesn't fit the available space, fall back to *both* short names. We
// never render one team as long and the other as short — keeps the score
// header visually symmetrical.
//
// `maxLongLength` is the character-count threshold that triggers the fall
// back. Tune per-context: tighter for the score header, looser for the
// line-selection tabs.

export interface DisplayNamePair { A: string; B: string }

interface NameLike { name: string; short: string }

export function pickDisplayNames(
  teamA: NameLike,
  teamB: NameLike,
  maxLongLength: number,
): DisplayNamePair {
  const useShort = teamA.name.length > maxLongLength
                || teamB.name.length > maxLongLength
  return {
    A: useShort ? teamA.short : teamA.name,
    B: useShort ? teamB.short : teamB.name,
  }
}
