import { describe, it, expect } from 'vitest'
import { daysOnRoutine, previewList } from './week.js'

describe('daysOnRoutine', () => {
  it('lists the days Monday-first, with Sunday last', () => {
    expect(daysOnRoutine({ 0: 'a', 1: 'a', 3: 'b', 5: 'a' }, 'a')).toEqual([1, 5, 0])
  })
  it('is empty for a routine that is on no day', () => {
    expect(daysOnRoutine({ 1: 'a' }, 'b')).toEqual([])
  })
  it('copes with a missing week', () => {
    expect(daysOnRoutine(undefined, 'a')).toEqual([])
  })
})

describe('previewList', () => {
  it('shows everything when it fits', () => {
    expect(previewList(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], more: 0 })
  })
  it('cuts a long list and counts what is left', () => {
    expect(previewList(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ shown: ['a', 'b', 'c', 'd'], more: 3 })
  })
  it('shows the last name rather than a lone "+1 more"', () => {
    expect(previewList(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c', 'd', 'e'], more: 0 })
  })
  it('handles an empty routine', () => {
    expect(previewList([])).toEqual({ shown: [], more: 0 })
  })
})
