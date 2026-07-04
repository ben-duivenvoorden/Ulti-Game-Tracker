import { describe, it, expect } from 'vitest'
import { buildMatcher, levenshtein, AUTO_CONFIDENCE, MIN_CONFIDENCE } from '../voice/match'

// Roster shaped like a real mixed team: overlapping sounds, nicknames, and a
// pair sharing a phonetically-close first name.
const ROSTER = [
  { id: 1, name: 'Ben Duivenvoorden',  spokenAliases: ['Bennie'] },
  { id: 2, name: 'Sam Kooistra',       spokenAliases: [] },
  { id: 3, name: 'Alice de Vries',     spokenAliases: ['Ali'] },
  { id: 4, name: 'Alex Janssen',       spokenAliases: [] },
  { id: 5, name: 'Tom van der Berg',   spokenAliases: ['Tommy'] },
  { id: 6, name: 'Adilia Santos',      spokenAliases: [] },
  { id: 7, name: 'Ikkei Tanaka',       spokenAliases: ['Beast'] },
]

const matcher = buildMatcher(ROSTER)

describe('levenshtein', () => {
  it('computes classic distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('ben', 'ben')).toBe(0)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})

describe('buildMatcher', () => {
  it('matches exact first names with full confidence', () => {
    const m = matcher.match('Sam')
    expect(m.playerId).toBe(2)
    expect(m.confidence).toBe(1)
  })

  it('matches exact surnames', () => {
    const m = matcher.match('Kooistra')
    expect(m.playerId).toBe(2)
    expect(m.confidence).toBe(1)
  })

  it('matches nicknames from spokenAliases with full confidence', () => {
    expect(matcher.match('Bennie').playerId).toBe(1)
    expect(matcher.match('Beast').playerId).toBe(7)
    expect(matcher.match('Beast').confidence).toBe(1)
  })

  it('matches phonetic misspellings (STT drift) above the auto band', () => {
    // Whisper hears "Adeelia" for Adilia — same metaphone key.
    const m = matcher.match('Adeelia')
    expect(m.playerId).toBe(6)
    expect(m.confidence).toBeGreaterThanOrEqual(AUTO_CONFIDENCE)
  })

  it('is case / punctuation insensitive', () => {
    expect(matcher.match('BEN,').playerId).toBe(1)
    expect(matcher.match('ali.').playerId).toBe(3)
  })

  it('returns no match for a word that is nobody', () => {
    const m = matcher.match('xylophone')
    expect(m.playerId).toBeNull()
    expect(m.confidence).toBeLessThan(MIN_CONFIDENCE)
  })

  it('demotes ambiguous matches below the auto band', () => {
    // Two players sharing an identical speakable form are never auto-applied.
    const twins = buildMatcher([
      { id: 10, name: 'Ben Smith', spokenAliases: [] },
      { id: 11, name: 'Ben Jones', spokenAliases: [] },
    ])
    const m = twins.match('Ben')
    expect(m.playerId).not.toBeNull()
    expect(m.confidence).toBeLessThan(AUTO_CONFIDENCE)
  })

  it('disambiguates shared first names by surname', () => {
    const twins = buildMatcher([
      { id: 10, name: 'Ben Smith', spokenAliases: [] },
      { id: 11, name: 'Ben Jones', spokenAliases: [] },
    ])
    const m = twins.match('Jones')
    expect(m.playerId).toBe(11)
    expect(m.confidence).toBeGreaterThanOrEqual(AUTO_CONFIDENCE)
  })

  it('Alice vs Alex: close names stay distinct on exact hits', () => {
    expect(matcher.match('Alice').playerId).toBe(3)
    expect(matcher.match('Alex').playerId).toBe(4)
  })
})
