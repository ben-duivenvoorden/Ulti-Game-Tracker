// ─── In-play narration → RawEvents ────────────────────────────────────────────
// Grammar: `player (to player)* outcome?`, repeated. A pass chain is exactly a
// sequence of `possession` events; outcomes attach to the last named player:
//
//   "Sam to Ben to Alice, score"  → possession ×3, goal(Alice)
//   "Alice drop"                  → possession(Alice), receiver-error(Alice)
//   "Sam to Ben, Alice D"         → possession(Sam), possession(Ben), block(Alice)
//                                    (the D is on the LAST chain player's throw;
//                                     the defender is the player named before
//                                     the outcome word)
//
// No new RawEvent types — voice emits the existing union. The parser tracks a
// logical holder/possession so structural problems surface here; the store
// applier still runs every event through `canRecord` (single guard) before
// anything lands in the rawLog. Unknown tokens are surfaced, never dropped.

import type { TeamId } from '../types'
import { otherTeam } from '../types'
import type { RawEventInput } from '../engine'
import type { PlayerMatcher, TeamMatcher, TokenMatch } from './match'
import { AUTO_CONFIDENCE, MIN_CONFIDENCE } from './match'

export type OutcomeKind = 'goal' | 'receiver-error' | 'throw-away' | 'stall' | 'block' | 'intercept'

const OUTCOME_WORDS: Record<string, OutcomeKind> = {
  score: 'goal', scores: 'goal', scored: 'goal', goal: 'goal',
  drop: 'receiver-error', drops: 'receiver-error', dropped: 'receiver-error',
  throwaway: 'throw-away',
  stall: 'stall', stalled: 'stall',
  d: 'block', dee: 'block', block: 'block', blocked: 'block',
  intercept: 'intercept', intercepted: 'intercept', interception: 'intercept', callahan: 'intercept',
}

const CONNECTORS = new Set(['to', 'too'])
const NOISE      = new Set(['the', 'a', 'an', 'and', 'then', 'uh', 'um'])

const normalize = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

export interface ParseContext {
  pointIndex: number
  /** Team in possession when the narration starts. */
  possession: TeamId
  /** Holder when the narration starts (null after a pull / turnover). */
  discHolder: number | null
  /** Positional team of a roster player (null = not in this game). */
  teamOf: (playerId: number) => TeamId | null
  /** RecordingOptions gates. */
  passes: boolean
  stall:  boolean
}

export interface VoiceEvent {
  input:      RawEventInput
  playerName: string | null
  /** Match confidence of the token this event came from (outcome events carry
   *  their player's). Below AUTO_CONFIDENCE the review sheet marks it amber. */
  confidence: number
}

export interface ParsedNarration {
  events:    VoiceEvent[]
  /** Structural problems, human-readable. Non-empty ⇒ review before applying. */
  issues:    string[]
  /** Spoken words that matched no roster player — shown, never dropped. */
  unmatched: string[]
}

/** Fold the bigram "throw away" into the single outcome token. */
function foldBigrams(words: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (normalize(words[i]) === 'throw' && i + 1 < words.length && normalize(words[i + 1]) === 'away') {
      out.push('throwaway')
      i++
    } else {
      out.push(words[i])
    }
  }
  return out
}

// ─── Line mode: team names + player names ─────────────────────────────────────
// LineSelection push-to-talk — one hold can build both lines: a spoken team
// name (or a distinctive part of it) switches which roster the following
// player names land in, e.g. "Lizards Alex Ben … Gooselings Ana Kim". Every
// recognised player name adds that player to the named team's line; no
// outcome words, no events. The line UI itself is the review surface, so this
// returns per-team matches (with confidence, for amber-marking), the words
// that matched nobody, and the team context left active at the end — the tab
// the screen should show.

export interface TeamLineCall {
  matches:   Record<TeamId, TokenMatch[]>
  unmatched: string[]
  /** Team named last — the tab to leave active. */
  finalTeam: TeamId
}

export function matchTeamLineCall(
  words:       string[],
  matchers:    Record<TeamId, PlayerMatcher>,
  teamMatcher: TeamMatcher,
  startTeam:   TeamId,
): TeamLineCall {
  const matches: Record<TeamId, TokenMatch[]> = { A: [], B: [] }
  const seen:    Record<TeamId, Set<number>>  = { A: new Set(), B: new Set() }
  const unmatched: string[] = []
  let current = startTeam
  for (const raw of words) {
    const w = normalize(raw)
    if (w.length === 0 || NOISE.has(w) || CONNECTORS.has(w)) continue
    // A word that confidently names a team switches the listing context —
    // unless it names a player on the current roster at least as well
    // (a player called Young beats the Young and the Restless mid-listing).
    const t = teamMatcher.match(w)
    const p = matchers[current].match(w)
    if (t.team !== null && t.confidence >= AUTO_CONFIDENCE && t.confidence > p.confidence) {
      current = t.team
      continue
    }
    if (p.playerId === null || p.confidence < MIN_CONFIDENCE) {
      unmatched.push(raw)
    } else if (!seen[current].has(p.playerId)) {
      // A repeated name is an STT stutter, not a toggle-off request.
      seen[current].add(p.playerId)
      matches[current].push(p)
    }
  }
  return { matches, unmatched, finalTeam: current }
}

export function parseNarration(words: string[], matcher: PlayerMatcher, ctx: ParseContext): ParsedNarration {
  const events:    VoiceEvent[] = []
  const issues:    string[] = []
  const unmatched: string[] = []

  // Logical state, evolved as events are emitted.
  let possession = ctx.possession
  let holder: { id: number; conf: number } | null =
    ctx.discHolder !== null ? { id: ctx.discHolder, conf: 1 } : null

  const push = (input: RawEventInput, playerName: string | null, confidence: number) =>
    events.push({ input, playerName, confidence })

  /** Named player catches / picks up for the possessing team. */
  const emitPossession = (m: TokenMatch) => {
    if (holder?.id === m.playerId) return   // already holding — nothing to record
    if (ctx.passes) {
      push(
        { pointIndex: ctx.pointIndex, type: 'possession', playerId: m.playerId!, teamId: possession },
        m.playerName, m.confidence,
      )
    }
    holder = { id: m.playerId!, conf: m.confidence }
  }

  const emitOutcome = (outcome: OutcomeKind, target: TokenMatch | null) => {
    switch (outcome) {
      case 'goal':
      case 'receiver-error':
      case 'throw-away':
      case 'stall': {
        // Holder-attributed: the named player must end up with the disc first.
        // (With passes off this pickup possession is still emitted for a goal —
        // `canRecord('goal')` needs a holder; it's the one possession per score.)
        if (target) {
          if (teamCheck(target, possession, outcome)) return
          if (holder?.id !== target.playerId) {
            if (ctx.passes || outcome === 'goal') {
              push(
                { pointIndex: ctx.pointIndex, type: 'possession', playerId: target.playerId!, teamId: possession },
                target.playerName, target.confidence,
              )
            }
            holder = { id: target.playerId!, conf: target.confidence }
          }
        }
        if (!holder) {
          issues.push(`"${outcome}" needs a player — no one has the disc`)
          return
        }
        if (outcome === 'stall' && !ctx.stall) {
          issues.push('Stall recording is off in settings — stall skipped')
          return
        }
        const type = outcome === 'goal' ? 'goal' as const
          : outcome === 'receiver-error' ? 'turnover-receiver-error' as const
          : outcome === 'throw-away' ? 'turnover-throw-away' as const
          : 'turnover-stall' as const
        push(
          { pointIndex: ctx.pointIndex, type, playerId: holder.id, teamId: possession },
          target?.playerName ?? null, holder.conf,
        )
        holder = null
        possession = otherTeam(possession)
        break
      }

      case 'block':
      case 'intercept': {
        if (!target) {
          issues.push(`"${outcome}" needs the defender's name`)
          return
        }
        const defTeam = ctx.teamOf(target.playerId!)
        if (defTeam === possession) {
          issues.push(`${target.playerName} is on offence — can't record a ${outcome}`)
          return
        }
        if (!holder) {
          issues.push(`${outcome} by ${target.playerName} — but no thrower has the disc yet`)
        }
        push(
          { pointIndex: ctx.pointIndex, type: outcome, playerId: target.playerId!, teamId: defTeam ?? otherTeam(possession) },
          target.playerName, target.confidence,
        )
        possession = defTeam ?? otherTeam(possession)
        holder = outcome === 'intercept' ? { id: target.playerId!, conf: target.confidence } : null
        break
      }
    }
  }

  /** True (and logs an issue) when a holder-attributed target is on defence. */
  const teamCheck = (m: TokenMatch, poss: TeamId, outcome: OutcomeKind): boolean => {
    const team = ctx.teamOf(m.playerId!)
    if (team !== null && team !== poss) {
      issues.push(`${m.playerName} isn't on the team in possession — "${outcome}" skipped`)
      return true
    }
    return false
  }

  // ── Walk the words: buffer a player chain, flush on outcome / end. ──────────
  let chain: TokenMatch[] = []

  const flushChain = (outcome: OutcomeKind | null) => {
    if (outcome === 'block' || outcome === 'intercept') {
      // Last named player is the defender; everyone before them is the chain.
      const defender = chain.pop() ?? null
      for (const m of chain) {
        if (!teamCheck(m, possession, outcome)) emitPossession(m)
      }
      emitOutcome(outcome, defender)
    } else if (outcome) {
      // Holder-attributed outcome lands on the last chain player (or the
      // current holder when the scorer just says "score").
      const target = chain.pop() ?? null
      for (const m of chain) {
        if (!teamCheck(m, possession, outcome)) emitPossession(m)
      }
      emitOutcome(outcome, target)
    } else {
      for (const m of chain) {
        const team = ctx.teamOf(m.playerId!)
        if (team !== null && team !== possession) {
          issues.push(`${m.playerName} isn't on the team in possession — pass skipped`)
          continue
        }
        emitPossession(m)
      }
    }
    chain = []
  }

  for (const raw of foldBigrams(words)) {
    const w = normalize(raw)
    if (w.length === 0 || NOISE.has(w) || CONNECTORS.has(w)) continue

    const outcome = OUTCOME_WORDS[w]
    if (outcome) {
      flushChain(outcome)
      continue
    }

    const m = matcher.match(w)
    if (m.playerId === null || m.confidence < MIN_CONFIDENCE) {
      unmatched.push(raw)
      continue
    }
    chain.push(m)
  }
  flushChain(null)

  if (unmatched.length > 0) {
    issues.push(`Unrecognised: ${unmatched.join(', ')}`)
  }
  return { events, issues, unmatched }
}
