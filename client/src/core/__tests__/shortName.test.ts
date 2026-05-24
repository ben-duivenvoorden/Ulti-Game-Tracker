import { describe, it, expect } from 'vitest'
import { suggestShortName, SHORT_NAME_MAX } from '../teams/shortName'

describe('suggestShortName', () => {
  it('returns the initials of each word for multi-word names', () => {
    expect(suggestShortName('Lounge Lizards Eastside')).toBe('LLE')
    expect(suggestShortName('New York Empire')).toBe('NYE')
    expect(suggestShortName('Goose Gooselings')).toBe('GG')
  })

  it('takes the first N characters of single-word names', () => {
    expect(suggestShortName('Empire')).toBe('EMPIR')
    expect(suggestShortName('Goose')).toBe('GOOSE')
    expect(suggestShortName('Lizards')).toBe('LIZAR')
  })

  it('upper-cases the result', () => {
    expect(suggestShortName('empire')).toBe('EMPIR')
    expect(suggestShortName('lounge lizards eastside')).toBe('LLE')
  })

  it('caps at the configured max length', () => {
    expect(suggestShortName('A B C D E F G H')).toBe('ABCDE')   // 8 words, cap to 5
    expect(suggestShortName('Longertown')).toBe('LONGE')         // 10 chars, cap to 5
  })

  it('returns an empty string for empty / whitespace input', () => {
    expect(suggestShortName('')).toBe('')
    expect(suggestShortName('   ')).toBe('')
  })

  it('handles extra whitespace between words gracefully', () => {
    expect(suggestShortName('Lounge   Lizards   Eastside')).toBe('LLE')
    expect(suggestShortName('  Empire  ')).toBe('EMPIR')
  })

  it('honours a custom max', () => {
    expect(suggestShortName('Empire', 3)).toBe('EMP')
    expect(suggestShortName('Lounge Lizards Eastside Pickup', 3)).toBe('LLE')
  })

  it('exposes SHORT_NAME_MAX as 5', () => {
    expect(SHORT_NAME_MAX).toBe(5)
  })
})
