// ─── Live narration → RawEvents ───────────────────────────────────────────────
// Grammar: `player (to player)* outcome?`, repeated, plus standalone words for
// everything else in the log:
//
//   "Kim pull"                    → pull(Kim)          (awaiting-pull only)
//   "Kim bonus" / "Kim brick"     → pull-bonus / brick (option-gated → plain pull)
//   "Kim pull, Sam to Ben, score" → pull, possession ×2, goal — one breath
//   "Sam to Ben to Alice, score"  → possession ×3, goal(Alice)
//   "Alice drop"                  → possession(Alice), receiver-error(Alice)
//   "Sam to Ben, Alice D"         → possession(Sam), possession(Ben), block(Alice)
//   "foul" / "pick" / "timeout"   → the bare stoppage event
//   "undo"                        → an undo event (pops the last visible entry)
//   "injury" / "injury sub"       → opens the injury line editor after applying
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

/** Pull-family words — attributed to the last named player (the puller),
 *  meaningful only while the point awaits its pull. */
const PULL_WORDS: Record<string, 'pull' | 'pull-bonus' | 'brick'> = {
  pull: 'pull', pulls: 'pull', pulled: 'pull',
  bonus: 'pull-bonus',
  brick: 'brick', bricked: 'brick',
}

/** Standalone commands — bare events with no player attribution. */
const COMMAND_WORDS: Record<string, 'undo' | 'foul' | 'pick' | 'timeout'> = {
  undo: 'undo',
  foul: 'foul', fouls: 'foul', fouled: 'foul',
  pick: 'pick',
  timeout: 'timeout',
}

/** Injury words — no event to emit (an injury sub needs the line editor); the
 *  parse result carries a follow-up so the UI opens it after applying. */
const INJURY_WORDS = new Set(['injury', 'injured'])

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
  passes:    boolean
  stall:     boolean
  pullBonus: boolean
  brick:     boolean
  /** True when narration starts before the pull — the pull-family words
   *  apply, and nothing else can land until one of them does. The parser
   *  walks itself into in-play after the pull, so "Kim pull, Sam to Ben,
   *  score" works in one breath. */
  awaitingPull: boolean
  /** Puller pre-selected in the UI — lets a bare "pull" attribute. */
  selPuller: number | null
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
  /** UI action to run after the events apply — no event can express it
   *  (an injury sub needs the line editor). */
  followUp?: 'injury-sub'
}

/** Fold two-word phrases into their single-token forms. */
function foldBigrams(words: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const a = normalize(words[i])
    const b = i + 1 < words.length ? normalize(words[i + 1]) : ''
    if (a === 'throw' && b === 'away')  { out.push('throwaway'); i++; continue }
    if (a === 'pull'  && b === 'bonus') { out.push('bonus');     i++; continue }
    if (a === 'time'  && b === 'out')   { out.push('timeout');   i++; continue }
    if (a === 'injury' && (b === 'sub' || b === 'substitution' || b === 'timeout' || b === 'stoppage')) {
      out.push('injury'); i++; continue
    }
    out.push(words[i])
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

// ─── Live-caption word classification ─────────────────────────────────────────
// Per-word highlighting for the live strip — mirrors exactly what the parser
// does with each word, without emitting anything.

export type WordKind = 'player' | 'keyword' | 'noise' | 'unknown'

export interface ClassifiedWord {
  word: string
  kind: WordKind
}

const isBigramKeyword = (a: string, b: string): boolean =>
  (a === 'throw' && b === 'away') ||
  (a === 'pull' && b === 'bonus') ||
  (a === 'time' && b === 'out') ||
  (a === 'injury' && (b === 'sub' || b === 'substitution' || b === 'timeout' || b === 'stoppage'))

export function classifyWords(words: string[], matcher: PlayerMatcher): ClassifiedWord[] {
  const out: ClassifiedWord[] = []
  for (let i = 0; i < words.length; i++) {
    const w = normalize(words[i])
    const next = i + 1 < words.length ? normalize(words[i + 1]) : ''
    if (isBigramKeyword(w, next)) {
      out.push({ word: words[i], kind: 'keyword' }, { word: words[i + 1], kind: 'keyword' })
      i++
      continue
    }
    if (w.length === 0 || NOISE.has(w) || CONNECTORS.has(w)) {
      out.push({ word: words[i], kind: 'noise' })
      continue
    }
    if (OUTCOME_WORDS[w] || PULL_WORDS[w] || COMMAND_WORDS[w] || INJURY_WORDS.has(w)) {
      out.push({ word: words[i], kind: 'keyword' })
      continue
    }
    const m = matcher.match(w)
    out.push({
      word: words[i],
      kind: m.playerId !== null && m.confidence >= MIN_CONFIDENCE ? 'player' : 'unknown',
    })
  }
  return out
}

export function parseNarration(words: string[], matcher: PlayerMatcher, ctx: ParseContext): ParsedNarration {
  const events:    VoiceEvent[] = []
  const issues:    string[] = []
  const unmatched: string[] = []

  // Logical state, evolved as events are emitted.
  let possession = ctx.possession
  let holder: { id: number; conf: number } | null =
    ctx.discHolder !== null ? { id: ctx.discHolder, conf: 1 } : null
  let awaitingPull = ctx.awaitingPull
  let followUp: 'injury-sub' | undefined

  const push = (input: RawEventInput, playerName: string | null, confidence: number) =>
    events.push({ input, playerName, confidence })

  /** Pull-family event — puller = last named player (or the UI-selected
   *  puller for a bare "pull"), recorded for the pulling team. */
  const emitPull = (kindIn: 'pull' | 'pull-bonus' | 'brick', token: TokenMatch | null) => {
    if (!awaitingPull) {
      issues.push(`The pull is already recorded — "${kindIn}" skipped`)
      return
    }
    // Option gates downgrade to a plain pull rather than dropping the point's
    // opening event.
    let kind = kindIn
    if (kind === 'pull-bonus' && !ctx.pullBonus) {
      issues.push('Pull bonus is off in settings — recorded as a plain pull')
      kind = 'pull'
    }
    if (kind === 'brick' && !ctx.brick) {
      issues.push('Brick is off in settings — recorded as a plain pull')
      kind = 'pull'
    }
    const pullingTeam = otherTeam(possession)
    let playerId   = token?.playerId ?? null
    let confidence = token?.confidence ?? 1
    const playerName = token?.playerName ?? null
    if (playerId === null && ctx.selPuller !== null) { playerId = ctx.selPuller; confidence = 1 }
    if (playerId === null) {
      issues.push(`"${kindIn}" needs the puller's name`)
      return
    }
    const team = ctx.teamOf(playerId)
    if (team !== null && team !== pullingTeam) {
      issues.push(`${playerName ?? 'That player'} isn't on the pulling team — "${kindIn}" skipped`)
      return
    }
    push({ pointIndex: ctx.pointIndex, type: kind, playerId, teamId: pullingTeam }, playerName, confidence)
    // Play continues from here: receiving team already holds `possession`,
    // the disc is dead until someone picks it up.
    awaitingPull = false
    holder = null
  }

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
    // Before the pull nothing in the in-play grammar can land — surface what
    // was heard instead of emitting an invalid batch.
    if (awaitingPull) {
      if (outcome) {
        issues.push(`Point starts with the pull — "${outcome}" skipped (say "<puller> pull" first)`)
      } else if (chain.length > 0) {
        issues.push(`Heard ${chain.map(m => m.playerName).join(', ')} before the pull — say "<name> pull"`)
      }
      chain = []
      return
    }
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

    const pullKind = PULL_WORDS[w]
    if (pullKind) {
      const puller = chain.pop() ?? null
      if (chain.length > 0) {
        issues.push(`Ignored before the pull: ${chain.map(m => m.playerName).join(', ')}`)
        chain = []
      }
      emitPull(pullKind, puller)
      continue
    }

    const command = COMMAND_WORDS[w]
    if (command) {
      flushChain(null)
      if (command === 'undo') {
        // The rewound state is unknowable here — recordVoiceEvents re-derives
        // and re-validates the whole batch, so later words stay guarded.
        push({ pointIndex: ctx.pointIndex, type: 'undo' }, null, 1)
        holder = null
      } else {
        push({ pointIndex: ctx.pointIndex, type: command }, null, 1)
      }
      continue
    }

    if (INJURY_WORDS.has(w)) {
      flushChain(null)
      followUp = 'injury-sub'
      continue
    }

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
  return { events, issues, unmatched, ...(followUp ? { followUp } : {}) }
}
