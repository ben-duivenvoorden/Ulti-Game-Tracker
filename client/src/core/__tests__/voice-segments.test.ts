import { describe, it, expect } from 'vitest'
import { transcriptWords, tailWords } from '../voice/segments'

// The load-bearing identity: words(final) === concat(words(segment_i)) for
// both transcript shapes — native (segments joined by ' ') and mock (clauses
// kept comma/period-separated in the stored transcript).

describe('transcriptWords', () => {
  it('splits on whitespace and punctuation, dropping empties', () => {
    expect(transcriptWords('Kim pull, Sam to Ben. score!')).toEqual(
      ['Kim', 'pull', 'Sam', 'to', 'Ben', 'score'],
    )
  })

  it('handles leading/trailing separators and empty input', () => {
    expect(transcriptWords('  , Kim ...')).toEqual(['Kim'])
    expect(transcriptWords('')).toEqual([])
  })
})

describe('tailWords', () => {
  it('native shape: space-joined segments concatenate exactly', () => {
    const segments = ['Kim pull', 'Sam to Ben', 'Ben to Alice score']
    const final = segments.join(' ')
    const applied = transcriptWords(segments[0]).length + transcriptWords(segments[1]).length
    expect(tailWords(final, applied)).toEqual(['Ben', 'to', 'Alice', 'score'])
  })

  it('mock shape: comma/period separators in the final transcript do not shift the count', () => {
    // The mock's stopCapture returns the RAW stored transcript; partials
    // delivered the trimmed clauses. Word counts must still line up.
    const stored = 'Kim pull, Sam to Ben, Ben to Alice score.'
    const clauses = stored.split(/[,.]+/).map(c => c.trim()).filter(c => c.length > 0)
    const applied = clauses.slice(0, -1)
      .reduce((n, c) => n + transcriptWords(c).length, 0)
    expect(tailWords(stored, applied)).toEqual(['Ben', 'to', 'Alice', 'score'])
  })

  it('no partials heard: the whole transcript is the tail', () => {
    expect(tailWords('Sam to Ben score', 0)).toEqual(['Sam', 'to', 'Ben', 'score'])
  })

  it('everything already applied (or overcounted): empty tail', () => {
    expect(tailWords('Sam to Ben', 3)).toEqual([])
    expect(tailWords('Sam to Ben', 7)).toEqual([])
  })
})
